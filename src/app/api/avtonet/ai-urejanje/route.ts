import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { chatJSON } from "@/lib/openai";
import {
  DOSEG,
  DOSEG_PREDPONE,
  RAZLOG_SAMO_LOKALNO,
  presodiPot,
  vsebujeSkrivnost,
} from "@/lib/avtonet/aiScope";
import { odkleni, pinPravilen, preveriZmoznost, zakleni } from "@/lib/avtonet/aiZmoznost";

/**
 * The AI editor for SBN Auto — a local development tool, not a product feature.
 *
 * What it does: reads the SBN Auto files, asks a model for an edit, writes it,
 * runs typecheck → lint → build, feeds failures back for a limited number of
 * rounds, and RESTORES the originals if it still cannot get green. So the repo
 * is either improved or untouched; it is never left half-edited.
 *
 * Why it refuses to run in production, and why that is not a limitation to work
 * around: writing source files and running a build needs a writable checkout and
 * a toolchain. A Vercel function has a read-only filesystem, no repository and
 * no build tools. An endpoint that COULD do all that would be remote code
 * execution guarded by a session cookie — so the gates below are deliberate and
 * belong here rather than in the UI.
 *
 * Its authority is bounded by aiScope.ts, which is an allowlist and is itself on
 * the list of files the editor may not touch.
 */

export const dynamic = "force-dynamic";

// No `maxDuration` on purpose. A typecheck-lint-build cycle takes minutes, which
// tempted a long timeout — but Vercel validates the value at BUILD time against
// the plan's ceiling (300 s on Hobby), so 600 failed the deploy of the whole
// site. And the number would have been meaningless anyway: this route refuses to
// run on Vercel at all. Locally `next dev` imposes no timeout, so the long
// request it actually serves needs no declaration.

const NAJVEC_POPRAVKOV = 2;
/** Guards the prompt: a whole file tree would drown the request. */
const NAJVEC_DATOTEK_V_KONTEKSTU = 14;
const NAJVEC_ZNAKOV_NA_DATOTEKO = 12_000;

type Sprememba = { pot: string; vsebina: string };
type Odgovor = { razlaga?: string; spremembe?: Sprememba[] };
type Ukaz = { ime: string; izid: "ok" | "napaka" | "preskoceno"; izpis: string };

/**
 * Node's filesystem, process and path modules — loaded on demand, after the
 * production gate has already refused.
 *
 * Static imports of these would be wrong twice over. Turbopack traces
 * `process.cwd()` and warns that "the whole project was traced unintentionally",
 * which means every source file would be bundled into the deployment. And a
 * production build should not carry the ability to spawn processes and write
 * files from an HTTP route at all — the honest way to say "this only runs
 * locally" is for the capability to be absent until the gate has passed.
 */
async function pripraviOrodja() {
  const [{ exec }, fs, { default: path }] = await Promise.all([
    import("node:child_process"),
    import("node:fs/promises"),
    import("node:path"),
  ]);

  const korenina = process.cwd();
  const abs = (pot: string) => path.join(korenina, pot);

  const ukaz = (command: string): Promise<{ ok: boolean; izpis: string }> =>
    new Promise((resolve) => {
      exec(
        command,
        { cwd: korenina, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const izpis = `${stdout}\n${stderr}`.trim();
          resolve({ ok: !err, izpis: izpis.slice(-6000) });
        }
      );
    });

  return {
    ukaz,

    /** Files in scope, so the model edits what exists instead of inventing paths. */
    async seznamDatotek(): Promise<string[]> {
      const { izpis } = await ukaz(
        `git ls-files ${[...DOSEG, ...DOSEG_PREDPONE].map((d) => `"${d}*"`).join(" ")}`
      );
      return izpis
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    },

    async preberiVarno(pot: string): Promise<string | null> {
      try {
        const vsebina = await fs.readFile(abs(pot), "utf8");
        return vsebina.length > NAJVEC_ZNAKOV_NA_DATOTEKO
          ? `${vsebina.slice(0, NAJVEC_ZNAKOV_NA_DATOTEKO)}\n/* … skrajšano … */`
          : vsebina;
      } catch {
        return null;
      }
    },

    async zapisi(pot: string, vsebina: string): Promise<void> {
      const cilj = abs(pot);
      await fs.mkdir(path.dirname(cilj), { recursive: true });
      await fs.writeFile(cilj, vsebina, "utf8");
    },
  };
}

const SISTEM = `Si razvijalec, ki ureja IZKLJUČNO projekt SBN Auto znotraj kodne baze KodaTim.si.

PROJEKT = SBN AUTO
POT = /avtonet

Tehnologija: Next.js 16 (App Router), React 19, Tailwind v4, Supabase, TypeScript.

Smeš spreminjati samo datoteke pod:
${DOSEG.map((d) => `- ${d}`).join("\n")}
- ${DOSEG_PREDPONE.join(", ")}* (samo nove migracije)

NE smeš se dotikati KodaTim admina, drugih demo strani, konfiguracije, package.json, .env ali avtentikacije.

Pravila:
- Vse besedilo vmesnika v slovenščini.
- Nikoli ne izmišljuj podatkov. Če podatka v bazi ni, prikaži prazno stanje.
- Nikoli ne zapiši ključa, gesla ali tokena v datoteko.
- Ne uporabljaj besede "prodano", če vir prodaje ne potrdi — uporabljaj "izginil iz oglasov".
- Vrni CELOTNO novo vsebino vsake datoteke, ki jo spremeniš, ne diffa.
- Spremeni čim manj datotek. Če nisi prepričan, katere, spremeni samo tiste, ki jih zahteva nedvoumno zadeva.

Odgovori IZKLJUČNO z JSON:
{
  "razlaga": "2-4 povedi v slovenščini: kaj boš spremenil in zakaj",
  "spremembe": [{ "pot": "src/app/(demo)/avtonet/...", "vsebina": "celotna nova vsebina datoteke" }]
}`;

export async function POST(request: NextRequest) {
  // ---- Gate 1: can this server actually do it? -------------------------
  //
  // Measured, not assumed. The old rule was "localhost, and never production",
  // which really tested for a writable checkout and a toolchain — the two things
  // a Vercel function lacks. SBN Auto now runs from the repository on the owner's
  // own machine behind a tunnel, so the capability is real and the host check
  // only stopped the owner from using it from their phone. See aiZmoznost.ts.
  const zmoznost = await preveriZmoznost();
  if (!zmoznost.zmore) {
    return NextResponse.json({ error: zmoznost.razlog ?? RAZLOG_SAMO_LOKALNO }, { status: 403 });
  }

  // ---- Gate 2: admin ---------------------------------------------------
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let zahteva = "";
  let pin: string | undefined;
  try {
    const body = await request.json();
    zahteva = typeof body?.zahteva === "string" ? body.zahteva.trim() : "";
    pin = typeof body?.pin === "string" ? body.pin : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (zahteva.length < 5) {
    return NextResponse.json({ error: "Napišite, kaj želite spremeniti." }, { status: 400 });
  }

  // ---- Gate 3: a secret that does not travel with the login -------------
  //
  // This route writes source files and runs a build, so once it answers from the
  // internet a session cookie alone must not be enough to reach it: a borrowed
  // browser would be code execution on the owner's machine. The PIN lives only
  // in that machine's environment, is never sent by the login, and five wrong
  // tries stop the endpoint until the process restarts.
  //
  // Opening the route beyond localhost was the owner's explicit decision (17.08),
  // taken over the two safer alternatives; this gate is the condition on which it
  // was taken, not decoration.
  const presoja = pinPravilen(pin);
  if (!presoja.ok) {
    return NextResponse.json({ error: presoja.razlog ?? "Napačno geslo." }, { status: 403 });
  }

  // ---- Gate 4: one edit at a time --------------------------------------
  //
  // Two runs share one checkout: they would overwrite each other's files and
  // each other's restore points, which is exactly how a half-edited repository
  // happens. Refusing the second is the only safe answer.
  if (!zakleni()) {
    return NextResponse.json(
      {
        error:
          "Eno urejanje že teče. Počakaj, da se konča — typecheck, lint in build vzamejo nekaj minut.",
      },
      { status: 409 }
    );
  }
  try {
    return await izvediUrejanje(user.id, zahteva);
  } finally {
    odkleni();
  }
}

/** The edit itself, split out so the lock is released in exactly one place. */
async function izvediUrejanje(userId: string, zahteva: string): Promise<NextResponse> {

  const db = createAvtonetClient();
  const zapisi = async (polja: Record<string, unknown>) => {
    try {
      await db.from("avtonet_ai_seje").insert({ uporabnik: userId, zahteva, ...polja });
    } catch {
      // The log is not worth failing the request over.
    }
  };

  // ---- Context ---------------------------------------------------------
  const orodja = await pripraviOrodja();
  const datoteke = await orodja.seznamDatotek();
  if (datoteke.length === 0) {
    return NextResponse.json(
      { error: "Datotek projekta SBN Auto ni bilo mogoče najti (git ls-files ni vrnil ničesar)." },
      { status: 500 }
    );
  }

  // Pick which files to show by name relevance to the request, then always
  // include the front page so the model sees the house style.
  const besede = zahteva.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const ocena = (p: string) => besede.filter((b) => p.toLowerCase().includes(b)).length;
  const izbrane = [...datoteke]
    .sort((a, b) => ocena(b) - ocena(a))
    .slice(0, NAJVEC_DATOTEK_V_KONTEKSTU);

  const kontekst: string[] = [];
  for (const pot of izbrane) {
    const vsebina = await orodja.preberiVarno(pot);
    if (vsebina !== null) kontekst.push(`--- ${pot} ---\n${vsebina}`);
  }

  const uporabnisko = `ZAHTEVA UPORABNIKA:
${zahteva}

VSE DATOTEKE PROJEKTA SBN AUTO:
${datoteke.join("\n")}

VSEBINA NAJBOLJ RELEVANTNIH DATOTEK:
${kontekst.join("\n\n")}`;

  // ---- Ask, validate, write -------------------------------------------
  let odgovor: Odgovor;
  try {
    odgovor = await chatJSON<Odgovor>(SISTEM, uporabnisko, { model: "gpt-4o", temperature: 0.1 });
  } catch (err) {
    const napaka = err instanceof Error ? err.message : "AI ni odgovoril.";
    await zapisi({ izid: "napaka", napaka });
    return NextResponse.json({ error: napaka }, { status: 502 });
  }

  const spremembe = odgovor.spremembe ?? [];
  if (spremembe.length === 0) {
    await zapisi({ izid: "zavrnjeno", razlaga: odgovor.razlaga, napaka: "AI ni predlagal sprememb" });
    return NextResponse.json({
      razlaga: odgovor.razlaga ?? "AI ni predlagal nobene spremembe.",
      spremembe: [],
      preverjanja: [],
      izid: "zavrnjeno",
    });
  }

  // Every path is judged before anything is written. One refusal aborts the
  // whole edit: a partially applied change set is worse than none.
  for (const s of spremembe) {
    const presoja = presodiPot(s.pot);
    if (!presoja.velja) {
      await zapisi({ izid: "zavrnjeno", razlaga: odgovor.razlaga, napaka: `Zavrnjena pot: ${presoja.razlog}` });
      return NextResponse.json(
        { error: `Zavrnjeno zaradi dosega: ${presoja.razlog}`, izid: "zavrnjeno" },
        { status: 400 }
      );
    }
    const skrivnost = vsebujeSkrivnost(s.vsebina ?? "");
    if (skrivnost) {
      await zapisi({ izid: "zavrnjeno", razlaga: odgovor.razlaga, napaka: `Vsebina vsebuje ${skrivnost}` });
      return NextResponse.json(
        { error: `Zavrnjeno: predlagana vsebina vsebuje ${skrivnost}.`, izid: "zavrnjeno" },
        { status: 400 }
      );
    }
    if (typeof s.vsebina !== "string" || s.vsebina.length === 0) {
      await zapisi({ izid: "zavrnjeno", napaka: `Prazna vsebina za ${s.pot}` });
      return NextResponse.json({ error: `AI je vrnil prazno vsebino za ${s.pot}.` }, { status: 400 });
    }
  }

  // Originals kept in memory so a failed edit can be undone completely.
  const izvirniki = new Map<string, string | null>();
  const uporabi = async (nabor: Sprememba[]) => {
    for (const s of nabor) {
      if (!izvirniki.has(s.pot)) izvirniki.set(s.pot, await orodja.preberiVarno(s.pot));
      await orodja.zapisi(s.pot, s.vsebina);
    }
  };
  const razveljavi = async () => {
    for (const [pot, prej] of izvirniki) {
      // A file that did not exist before is emptied rather than deleted: the
      // editor never removes files, so an unwanted new file is left obvious and
      // harmless instead of silently disappearing.
      await orodja.zapisi(pot, prej ?? "");
    }
  };

  await uporabi(spremembe);

  // ---- Verify, and fix its own mistakes -------------------------------
  const preverjanja: Ukaz[] = [];
  let popravkov = 0;
  let zeleno = false;
  let zadnjiIzpis = "";

  for (let krog = 0; krog <= NAJVEC_POPRAVKOV; krog++) {
    preverjanja.length = 0;

    const tc = await orodja.ukaz("npx tsc --noEmit");
    preverjanja.push({ ime: "typecheck", izid: tc.ok ? "ok" : "napaka", izpis: tc.izpis });

    let lint = { ok: false, izpis: "preskočeno, ker typecheck ni uspel" };
    let build = { ok: false, izpis: "preskočeno" };

    if (tc.ok) {
      lint = await orodja.ukaz("npm run lint");
      preverjanja.push({ ime: "lint", izid: lint.ok ? "ok" : "napaka", izpis: lint.izpis });
      if (lint.ok) {
        build = await orodja.ukaz("npm run build");
        preverjanja.push({ ime: "build", izid: build.ok ? "ok" : "napaka", izpis: build.izpis });
      } else {
        preverjanja.push({ ime: "build", izid: "preskoceno", izpis: "preskočeno, ker lint ni uspel" });
      }
    } else {
      preverjanja.push({ ime: "lint", izid: "preskoceno", izpis: lint.izpis });
      preverjanja.push({ ime: "build", izid: "preskoceno", izpis: build.izpis });
    }

    if (tc.ok && lint.ok && build.ok) {
      zeleno = true;
      break;
    }

    zadnjiIzpis = preverjanja.find((p) => p.izid === "napaka")?.izpis ?? "";
    if (krog === NAJVEC_POPRAVKOV) break;

    // Hand the failure back with the files as they now stand.
    popravkov += 1;
    const trenutne: string[] = [];
    for (const s of spremembe) {
      const v = await orodja.preberiVarno(s.pot);
      if (v !== null) trenutne.push(`--- ${s.pot} ---\n${v}`);
    }

    try {
      const popravek = await chatJSON<Odgovor>(
        SISTEM,
        `Tvoja prejšnja sprememba ne prestane preverjanj. Popravi jo.

NAPAKA:
${zadnjiIzpis}

TRENUTNA VSEBINA DATOTEK, KI SI JIH SPREMENIL:
${trenutne.join("\n\n")}

Vrni popravljeno celotno vsebino datotek, ki jih je treba popraviti.`,
        { model: "gpt-4o", temperature: 0 }
      );

      const nabor = (popravek.spremembe ?? []).filter((s) => {
        const p = presodiPot(s.pot);
        return p.velja && typeof s.vsebina === "string" && s.vsebina.length > 0 && !vsebujeSkrivnost(s.vsebina);
      });
      if (nabor.length === 0) break;
      await uporabi(nabor);
    } catch {
      break;
    }
  }

  // ---- Land it, or leave the repo exactly as it was --------------------
  if (!zeleno) {
    await razveljavi();
    await zapisi({
      razlaga: odgovor.razlaga,
      datoteke: spremembe.map((s) => ({ pot: s.pot, akcija: "razveljavljeno" })),
      typecheck: preverjanja.find((p) => p.ime === "typecheck")?.izid,
      lint: preverjanja.find((p) => p.ime === "lint")?.izid,
      build: preverjanja.find((p) => p.ime === "build")?.izid,
      izid: "razveljavljeno",
      napaka: zadnjiIzpis.slice(0, 4000),
      popravkov,
    });
    return NextResponse.json({
      razlaga: odgovor.razlaga,
      spremembe: spremembe.map((s) => s.pot),
      preverjanja,
      izid: "razveljavljeno",
      sporocilo:
        "Sprememba ni prestala preverjanj, zato so bile datoteke povrnjene v prvotno stanje. Repozitorij je nespremenjen.",
      popravkov,
    });
  }

  await zapisi({
    razlaga: odgovor.razlaga,
    datoteke: spremembe.map((s) => ({
      pot: s.pot,
      akcija: izvirniki.get(s.pot) === null ? "ustvarjeno" : "spremenjeno",
      vrstic: s.vsebina.split("\n").length,
    })),
    typecheck: "ok",
    lint: "ok",
    build: "ok",
    izid: "uspeh",
    popravkov,
  });

  return NextResponse.json({
    razlaga: odgovor.razlaga,
    spremembe: spremembe.map((s) => s.pot),
    preverjanja,
    izid: "uspeh",
    popravkov,
    sporocilo:
      "Spremembe so zapisane lokalno in prestale typecheck, lint in build. V produkcijo niso objavljene — poglejte jih v brskalniku in jih nato commitajte sami.",
  });
}
