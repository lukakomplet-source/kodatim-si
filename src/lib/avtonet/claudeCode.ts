import "server-only";
import { DOSEG, DOSEG_PREDPONE, presodiPot } from "./aiScope";

/**
 * Handing a change to Claude Code instead of a one-shot model call.
 *
 * The chat could not "reach" the assistant the owner talks to in the terminal —
 * that session has no address and no inbox. But the CLI is installed on this
 * machine, and a request written on the site can start it: same tools (read,
 * grep, edit), same repository, no ten-second guess. That is the difference
 * between "predlagam, da preverimo, ali je filtriranje pravilno nastavljeno" and
 * a fix.
 *
 * Three things make this safe enough to be started from a browser (behind the
 * admin + PIN + one-at-a-time gates that already guard the editor):
 *
 *   1. the tool list is fixed — read and write files, search. No Bash, so it
 *      cannot run commands, install packages, push, or touch the database.
 *   2. what it changed is checked against the SBN Auto allowlist AFTERWARDS, by
 *      diffing git. A file outside the fence is reverted, not merely reported.
 *   3. typecheck, lint and build decide whether the work is kept. Red means the
 *      run's changes are reverted, so the repository is improved or untouched.
 *
 * Files the owner had already modified before the run are left alone in every
 * path through this: reverting somebody's work in progress would be worse than
 * any bug it was meant to fix.
 */

export type Preverjanje = { ime: string; izid: "ok" | "napaka" | "preskoceno"; izpis: string };

export type Izid = {
  ok: boolean;
  /** Claude's own account of what it did. */
  razlaga: string;
  datoteke: string[];
  preverjanja: Preverjanje[];
  /** Files it touched outside the fence; reverted, and worth saying out loud. */
  zavrnjene: string[];
  napaka: string | null;
  cenaUsd: number | null;
  motor: "claude-code";
};

const NAVODILA = `Delaš na projektu SBN Auto (pot /avtonet) v kodni bazi KodaTim.si.

Smeš spreminjati IZKLJUČNO datoteke pod:
${DOSEG.map((d) => `- ${d}`).join("\n")}
- ${DOSEG_PREDPONE.join(", ")}* (samo NOVE migracije)

Ne dotikaj se: KodaTim admina, drugih demo strani, konfiguracije, package.json, .env, avtentikacije.
Ne dodajaj novih odvisnosti. Ne poganjaj ukazov in ne delaj commita — to naredi ovojnica.

Pravila:
- Vse besedilo vmesnika v slovenščini.
- Nikoli ne izmišljuj podatkov; če podatka v bazi ni, prikaži prazno stanje in to povej.
- Nikoli ne zapiši ključa, gesla ali tokena v datoteko.
- Ne uporabljaj besede "prodano", če vir prodaje ne potrdi — uporabljaj "izginil iz oglasov".
- Preberi kodo, preden jo spremeniš. Popravi VZROK, ne simptoma.
- Spremeni čim manj datotek.
- Na koncu v dveh do štirih povedih povej, kaj si spremenil in zakaj.`;

type Ukazi = {
  git(args: string[]): Promise<{ ok: boolean; izpis: string }>;
  npm(args: string[], casMs: number): Promise<{ ok: boolean; izpis: string }>;
  claude(args: string[], casMs: number): Promise<{ ok: boolean; izpis: string }>;
  odstrani(pot: string): Promise<void>;
};

async function pripraviUkaze(): Promise<Ukazi> {
  const [{ execFile }, fs] = await Promise.all([
    import("node:child_process"),
    import("node:fs/promises"),
  ]);
  const korenina = process.cwd();

  // execFile with an argument ARRAY, never a shell string: paths here contain
  // "(demo)" and spaces, and one missing quote in a shell command is how a revert
  // deletes the wrong thing.
  const zazeni = (
    ukaz: string,
    args: string[],
    casMs: number
  ): Promise<{ ok: boolean; izpis: string }> =>
    new Promise((resolve) => {
      const p = execFile(
        ukaz,
        args,
        { cwd: korenina, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: casMs, shell: false },
        (err, stdout, stderr) => {
          const izpis = `${stdout}\n${stderr}`.trim();
          resolve({ ok: !err, izpis: izpis.slice(-12_000) });
        }
      );
      p.on("error", () => resolve({ ok: false, izpis: `Ukaza ${ukaz} ni bilo mogoče zagnati.` }));
    });

  return {
    git: (args) => zazeni("git", args, 60_000),
    npm: (args, casMs) => zazeni(process.platform === "win32" ? "npm.cmd" : "npm", args, casMs),
    claude: (args, casMs) =>
      zazeni(process.platform === "win32" ? "claude.exe" : "claude", args, casMs),
    odstrani: async (pot) => {
      const { join } = await import("node:path");
      await fs.rm(join(korenina, pot), { force: true });
    },
  };
}

/** Is the CLI actually here? Decides whether the chat offers this at all. */
export async function claudeCodeNaVoljo(): Promise<boolean> {
  try {
    const u = await pripraviUkaze();
    const { ok } = await u.claude(["--version"], 20_000);
    return ok;
  } catch {
    return false;
  }
}

/** `git status --porcelain` as a set of paths, so a diff can be taken. */
async function stanje(u: Ukazi): Promise<Map<string, string>> {
  const { izpis } = await u.git(["status", "--porcelain"]);
  const m = new Map<string, string>();
  for (const v of izpis.split("\n")) {
    const vrstica = v.trimEnd();
    if (vrstica.length < 4) continue;
    const oznaka = vrstica.slice(0, 2).trim();
    const pot = vrstica.slice(3).replace(/^"|"$/g, "");
    m.set(pot, oznaka);
  }
  return m;
}

async function povrni(u: Ukazi, poti: string[], novi: Set<string>): Promise<void> {
  for (const pot of poti) {
    if (novi.has(pot)) await u.odstrani(pot);
    else await u.git(["checkout", "--", pot]);
  }
}

function vDosegu(pot: string): boolean {
  return presodiPot(pot).velja;
}

/**
 * Runs one task and returns only after it has been judged by the checks.
 *
 * @param naloga  The confirmed plan, in the user's own words.
 * @param pot     The page the request came from, passed on as context.
 */
export async function izvediSClaudeCode(naloga: string, pot: string | null): Promise<Izid> {
  const u = await pripraviUkaze();
  const preverjanja: Preverjanje[] = [];

  const prej = await stanje(u);

  const vprasanje =
    `${NAVODILA}\n\n` +
    (pot ? `Zahteva je bila napisana na strani: ${pot}\n\n` : "") +
    `NALOGA:\n${naloga}`;

  const { ok: klicOk, izpis } = await u.claude(
    [
      "-p",
      vprasanje,
      "--output-format",
      "json",
      // Files and search only. No Bash: a request typed into a web page must not
      // be able to run commands on this machine, whatever else it can do.
      "--allowedTools",
      "Read",
      "Edit",
      "Write",
      "Grep",
      "Glob",
      "--permission-mode",
      "acceptEdits",
    ],
    12 * 60_000
  );

  let razlaga = "";
  let cenaUsd: number | null = null;
  try {
    const telo = JSON.parse(izpis.slice(izpis.indexOf("{"))) as {
      result?: string;
      is_error?: boolean;
      total_cost_usd?: number;
    };
    razlaga = (telo.result ?? "").trim();
    cenaUsd = typeof telo.total_cost_usd === "number" ? telo.total_cost_usd : null;
  } catch {
    razlaga = izpis.slice(-2000);
  }

  const potem = await stanje(u);
  const spremenjene = [...potem.keys()].filter((p) => potem.get(p) !== prej.get(p));
  const novi = new Set(spremenjene.filter((p) => (potem.get(p) ?? "").includes("?")));

  // Outside the fence → reverted, then named. A file the owner had already
  // modified before this run is not this run's doing and is left untouched.
  const zavrnjene = spremenjene.filter((p) => !vDosegu(p) && !prej.has(p));
  if (zavrnjene.length > 0) await povrni(u, zavrnjene, novi);

  const nase = spremenjene.filter((p) => vDosegu(p) && !prej.has(p));

  if (!klicOk && nase.length === 0) {
    return {
      ok: false,
      razlaga: razlaga || "Claude Code ni odgovoril.",
      datoteke: [],
      preverjanja,
      zavrnjene,
      napaka: "Zagon ni uspel ali je bil prekinjen (največ 12 minut).",
      cenaUsd,
      motor: "claude-code",
    };
  }

  if (nase.length === 0) {
    return {
      ok: false,
      razlaga: razlaga || "Brez sprememb.",
      datoteke: [],
      preverjanja,
      zavrnjene,
      napaka: "Nobena datoteka v dosegu SBN Auto ni bila spremenjena.",
      cenaUsd,
      motor: "claude-code",
    };
  }

  // The checks decide. Ordered cheapest first, so a broken type does not wait out
  // a two-minute build to be reported.
  for (const [ime, args, casMs] of [
    ["typecheck", ["exec", "--", "tsc", "--noEmit"], 5 * 60_000],
    ["lint", ["run", "lint"], 5 * 60_000],
    ["build", ["run", "build"], 12 * 60_000],
  ] as const) {
    const { ok, izpis: izp } = await u.npm([...args], casMs);
    preverjanja.push({ ime, izid: ok ? "ok" : "napaka", izpis: izp.slice(-4000) });
    if (!ok) {
      await povrni(u, nase, novi);
      return {
        ok: false,
        razlaga,
        datoteke: nase,
        preverjanja,
        zavrnjene,
        napaka: `${ime} ni uspel — spremembe so povrnjene, repozitorij je nespremenjen.`,
        cenaUsd,
        motor: "claude-code",
      };
    }
  }

  return { ok: true, razlaga, datoteke: nase, preverjanja, zavrnjene, napaka: null, cenaUsd, motor: "claude-code" };
}

/**
 * The same CLI, read-only, used to write the PLAN.
 *
 * The plan was the part the owner rejected outright: a model answering from one
 * prompt produced "predlagam, da preverimo, ali je filtriranje pravilno
 * nastavljeno" and then named a file that had nothing to do with the page. Given
 * Read, Grep and Glob it does what a person does instead — opens the page, greps
 * for the words that were quoted, and says what is actually wrong.
 *
 * No Edit, no Write, no Bash: a plan must never change anything. That is also
 * what makes it safe for people who are not admins to ask for one.
 *
 * Screenshots are handed over as FILES, because Read renders an image. So the
 * same run sees the picture of the problem and the code behind it.
 */
export async function nacrtSClaudeCode(
  vprasanje: string,
  pot: string | null,
  slikePoti: string[] = []
): Promise<{ plan: string; cenaUsd: number | null } | null> {
  try {
    const u = await pripraviUkaze();
    const navodilo =
      `Si razvijalec na projektu SBN Auto (pot /avtonet) v tej kodni bazi. NE spreminjaj datotek — ` +
      `napiši samo načrt.\n\n` +
      `Preberi kodo, preden odgovoriš: odpri datoteke strani, na kateri je uporabnik, in poišči ` +
      `(Grep) besede, ki jih je navedel.\n\n` +
      (pot ? `Uporabnik je na strani: ${pot}\n` : "") +
      (slikePoti.length > 0
        ? `Priloženi posnetki zaslona (preberi jih z orodjem Read): ${slikePoti.join(", ")}\n` +
          `Najprej z eno povedjo povej, kaj je na posnetku.\n`
        : "") +
      `\nOdgovori v slovenščini, 2–5 povedi ali do 5 alinej, po tem vrstnem redu:\n` +
      `1) VZROK — kaj je v kodi narobe (imenuj datoteko in mesto),\n` +
      `2) POPRAVEK — kaj boš spremenil.\n` +
      `Brez "morda", "predlagam, da preverimo", "bilo bi smiselno". Če mesta v kodi ne najdeš, ` +
      `to povej in postavi eno konkretno vprašanje.\n\n` +
      `POGOVOR:\n${vprasanje}`;

    const { izpis } = await u.claude(
      ["-p", navodilo, "--output-format", "json", "--allowedTools", "Read", "Grep", "Glob"],
      5 * 60_000
    );
    const telo = JSON.parse(izpis.slice(izpis.indexOf("{"))) as {
      result?: string;
      total_cost_usd?: number;
    };
    const plan = (telo.result ?? "").trim();
    if (!plan) return null;
    return { plan, cenaUsd: typeof telo.total_cost_usd === "number" ? telo.total_cost_usd : null };
  } catch {
    return null;
  }
}

/** Screenshots to files, so Read can look at them. Returns absolute paths. */
export async function shraniSlikeZaBranje(dataUrls: string[]): Promise<{ poti: string[]; pocisti: () => Promise<void> }> {
  const [fs, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const mapa = join(process.cwd(), ".next", "klepet-slike");
  await fs.mkdir(mapa, { recursive: true });

  const poti: string[] = [];
  for (const [i, url] of dataUrls.entries()) {
    const vejica = url.indexOf(",");
    if (vejica < 0) continue;
    const koncnica = /image\/(\w+)/.exec(url)?.[1] ?? "png";
    const pot = join(mapa, `posnetek-${Date.now()}-${i}.${koncnica === "jpeg" ? "jpg" : koncnica}`);
    await fs.writeFile(pot, Buffer.from(url.slice(vejica + 1), "base64"));
    poti.push(pot);
  }

  return {
    poti,
    // Deleted after the plan is written: these are somebody's screen, and a
    // temporary directory is not where that should quietly accumulate.
    pocisti: async () => {
      for (const p of poti) await fs.rm(p, { force: true });
    },
  };
}
