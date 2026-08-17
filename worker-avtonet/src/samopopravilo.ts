import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import type { Db } from "./db.js";
import { preberiBlokado, zabelezBlokado } from "./blokada.js";

/**
 * What happens when the collector stops collecting.
 *
 * The mechanical guards in this worker each cover one known failure: retries for
 * a bad request, cooling for a source pushing back, a block memory for a 403, a
 * stall guard for a wedged process. Every one of them was written after the fact,
 * and on 17.08 the failure was a wait loop that recomputed a constant remainder —
 * something none of them anticipated. Fifteen hours of "running" produced two
 * adverts.
 *
 * So this is the layer for the failures nobody anticipated: gather the evidence
 * a person would look at (log tail, guard state, block state, the research row,
 * the queue), hand it to a model, and act on the answer.
 *
 * Two boundaries, deliberately hard:
 *
 *  1. The model chooses from a FIXED list of remedies. It cannot invent an
 *     action, cannot touch code, cannot run commands. Every remedy here is one
 *     an operator would reach for and none of them can lose collected data.
 *  2. Everything it decides is written into the database, so the console can say
 *     what was diagnosed and what was done. A repair nobody can see is
 *     indistinguishable from a bug.
 *
 * With no API key it still records the evidence bundle and takes the safe
 * default (restart). Diagnosis is a bonus; the recovery must not depend on it.
 */

export type Ukrep =
  | "ponovni_zagon"
  | "pocasneje"
  | "pocakaj_ure"
  | "preskoci_oglas"
  | "sprosti_vrsto"
  | "nic";

export type Diagnoza = {
  ob: string;
  sprozil: string;
  vzrok: string;
  ukrep: Ukrep;
  utemeljitev: string;
  izvedeno: string;
  vir: "ai" | "privzeto";
};

const DOVOLJENI: Ukrep[] = [
  "ponovni_zagon",
  "pocasneje",
  "pocakaj_ure",
  "preskoci_oglas",
  "sprosti_vrsto",
  "nic",
];

const DNEVNIK = process.env.AVTONET_LOG_FILE ?? "C:\\Users\\lukak\\avtonet-db\\worker.log";

/** The last N lines of the worker's own log — the single most useful evidence. */
function repDnevnika(vrstic = 60): string {
  try {
    if (!existsSync(DNEVNIK)) return "(dnevnika ni)";
    // Read only the tail: the file is capped at 20 MB but there is no reason to
    // pull all of it into memory during an incident.
    const velikost = statSync(DNEVNIK).size;
    const odKonca = Math.min(velikost, 200_000);
    const buf = Buffer.alloc(odKonca);
    const fd = openSync(DNEVNIK, "r");
    try {
      readSync(fd, buf, 0, odKonca, velikost - odKonca);
    } finally {
      closeSync(fd);
    }
    return buf.toString("utf8").split(/\r?\n/).slice(-vrstic).join("\n");
  } catch (err) {
    return `(dnevnika ni bilo mogoče prebrati: ${err instanceof Error ? err.message : "?"})`;
  }
}

type Dokazi = {
  sprozil: string;
  ob: string;
  zbiralnik: unknown;
  blokada: unknown;
  raziskava: unknown;
  brezDetajla: number | null;
  parkiranih: number | null;
  dnevnik: string;
};

async function zberiDokaze(db: Db, sprozil: string): Promise<Dokazi> {
  // PostgREST builders are thenable but not Promises, so the wrapper takes
  // anything awaitable — and swallows failures: evidence gathering must never be
  // the reason an incident goes unreported.
  const varno = async <T>(delo: PromiseLike<T>, privzeto: T): Promise<T> => {
    try {
      return await delo;
    } catch {
      return privzeto;
    }
  };

  const kljuc = async (k: string) =>
    (
      await varno(
        db.from("avtonet_statistika").select("podatki").eq("kljuc", k).maybeSingle(),
        { data: null } as { data: { podatki: unknown } | null }
      )
    ).data?.podatki ?? null;

  const raziskava = (
    await varno(
      db
        .from("avtonet_raziskave")
        .select(
          "id, status, faza, zacetek, strani_pregledanih, oglasov_najdenih, detajlov_obdelanih, detajlov_skupaj, napak, zadnja_napaka, updated_at"
        )
        .in("status", ["zahtevano", "tece"])
        .limit(1)
        .maybeSingle(),
      { data: null } as { data: unknown }
    )
  ).data;

  const brezDetajla = (
    await varno(
      db
        .from("avtonet_oglasi")
        .select("id", { count: "exact", head: true })
        .eq("status", "aktiven")
        .is("detajl_zajet", null),
      { count: null } as { count: number | null }
    )
  ).count;

  const parkiranih = (
    await varno(
      db
        .from("avtonet_oglasi")
        .select("id", { count: "exact", head: true })
        .gt("detajl_naslednji_poskus", new Date().toISOString()),
      { count: null } as { count: number | null }
    )
  ).count;

  return {
    sprozil,
    ob: new Date().toISOString(),
    zbiralnik: await kljuc("zbiralnik"),
    blokada: await kljuc("blokada"),
    raziskava,
    brezDetajla,
    parkiranih,
    dnevnik: repDnevnika(),
  };
}

const NAVODILO = `Si diagnostik za zbiralnik podatkov (Node + Playwright), ki zajema oglase z avto.neta.
Dobiš dokaze o incidentu. Ugotovi NAJVERJETNEJŠI vzrok in izberi TOČNO EN ukrep s seznama.

Ukrepi (edini dovoljeni):
- "ponovni_zagon" — proces je zataknjen/nedosleden; ponovni zagon ga odblokira (privzeta varna izbira)
- "pocasneje" — vir nas duši (prazne strani, veliko napak); podvoji razmike in delaj z eno nitjo
- "pocakaj_ure" — vir aktivno blokira (403/429); počakaj nekaj ur, preden spet poskusimo
- "preskoci_oglas" — točno določen oglas ruši obdelavo; parkiraj ga in nadaljuj
- "sprosti_vrsto" — vrsta je prazna, ker so vsi oglasi parkirani; sprosti pretekle parkirnine
- "nic" — nič ni narobe ali ni varnega ukrepa

Pravila:
- Odgovori SAMO z JSON: {"vzrok": "...", "ukrep": "...", "utemeljitev": "...", "ureCakanja": 0}
- "vzrok" in "utemeljitev" v slovenščini, kratko (največ dva stavka), brez ugibanja o stvareh, ki jih dokazi ne pokažejo.
- "ureCakanja" izpolni samo pri "pocakaj_ure" (1–12), sicer 0.
- Če dokazi kažejo, da se proces vrti v prazno (nič obdelanega, brez napak, brez blokade), je to zataknjen proces → "ponovni_zagon".`;

async function vprasajAi(dokazi: Dokazi): Promise<{
  vzrok: string;
  ukrep: Ukrep;
  utemeljitev: string;
  ureCakanja: number;
} | null> {
  const kljuc = process.env.OPENAI_API_KEY;
  if (!kljuc) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${kljuc}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AVTONET_DIAG_MODEL ?? "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: NAVODILO },
          { role: "user", content: JSON.stringify(dokazi).slice(0, 60_000) },
        ],
      }),
      // The incident is already an incident; the diagnosis must not become one.
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const telo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const vsebina = telo.choices?.[0]?.message?.content;
    if (!vsebina) return null;
    const out = JSON.parse(vsebina) as {
      vzrok?: string;
      ukrep?: string;
      utemeljitev?: string;
      ureCakanja?: number;
    };
    const ukrep = DOVOLJENI.includes(out.ukrep as Ukrep) ? (out.ukrep as Ukrep) : "ponovni_zagon";
    return {
      vzrok: (out.vzrok ?? "neznano").slice(0, 400),
      ukrep,
      utemeljitev: (out.utemeljitev ?? "").slice(0, 400),
      ureCakanja: Math.min(12, Math.max(0, Math.round(Number(out.ureCakanja ?? 0)))),
    };
  } catch {
    return null;
  }
}

/** Applies one remedy. Nothing here can delete or overwrite collected data. */
async function izvedi(
  db: Db,
  ukrep: Ukrep,
  ureCakanja: number,
  log: (l: "info" | "warn" | "error", m: string, e?: Record<string, unknown>) => void
): Promise<string> {
  switch (ukrep) {
    case "pocasneje": {
      // Persisted where the collector already reads it at every start.
      const b = await preberiBlokado(db);
      const faktor = Math.min(4, Math.max(2, b.faktor * 2));
      await db.from("avtonet_statistika").upsert({
        kljuc: "blokada",
        podatki: { ...b, faktor, razlog: "samopopravilo: vir duši — podvojeni razmiki" },
        izracunano: new Date().toISOString(),
      });
      log("warn", "samopopravilo: zbiram pocasneje", { faktor });
      return `Razmiki povečani (faktor ${faktor}), ena nit — velja od naslednjega zagona.`;
    }
    case "pocakaj_ure": {
      const ur = ureCakanja > 0 ? ureCakanja : 2;
      const b = await zabelezBlokado(db, `samopopravilo: vir blokira — počakamo ${ur} h`);
      return `Zbiranje počiva do ${new Date(b.do ?? Date.now()).toLocaleString("sl-SI")}.`;
    }
    case "preskoci_oglas": {
      // Park whatever sits at the head of the queue: if one advert is what the
      // collector chokes on, it must not be the first thing it tries again.
      const { data } = await db
        .from("avtonet_oglasi")
        .select("id, avtonet_id")
        .eq("status", "aktiven")
        .is("detajl_zajet", null)
        .order("detajl_poskusov", { ascending: false })
        .limit(1)
        .maybeSingle();
      const vrstica = data as { id: string; avtonet_id: string } | null;
      if (!vrstica) return "Ni bilo oglasa na vrhu vrste — nič parkiranega.";
      await db
        .from("avtonet_oglasi")
        .update({ detajl_naslednji_poskus: new Date(Date.now() + 24 * 3_600_000).toISOString() })
        .eq("id", vrstica.id);
      return `Oglas ${vrstica.avtonet_id} parkiran za 24 h.`;
    }
    case "sprosti_vrsto": {
      const { count } = await db
        .from("avtonet_oglasi")
        .update({ detajl_naslednji_poskus: null, detajl_poskusov: 0 }, { count: "exact" })
        .gt("detajl_naslednji_poskus", new Date().toISOString());
      return `Sproščenih parkiranih oglasov: ${count ?? 0}.`;
    }
    case "ponovni_zagon":
      // The caller exits; the wrapper script starts a clean process and it
      // reclaims the running research immediately.
      return "Proces se konča in se zažene znova; raziskava se nadaljuje pri istem oglasu.";
    case "nic":
    default:
      return "Brez posega.";
  }
}

/**
 * The whole loop: evidence → diagnosis → remedy → record.
 *
 * Never throws. Never blocks longer than its own budget. Called from the stall
 * guard and from a failed research; both keep working if this does nothing.
 */
export async function samopopravilo(
  db: Db,
  sprozil: string,
  log: (l: "info" | "warn" | "error", m: string, e?: Record<string, unknown>) => void
): Promise<Diagnoza | null> {
  try {
    const dokazi = await zberiDokaze(db, sprozil);
    const ai = await vprasajAi(dokazi);

    const izbrani: Ukrep = ai?.ukrep ?? "ponovni_zagon";
    const izvedeno = await izvedi(db, izbrani, ai?.ureCakanja ?? 0, log);

    const d: Diagnoza = {
      ob: new Date().toISOString(),
      sprozil,
      vzrok: ai?.vzrok ?? "Ni bilo mogoče vprašati modela (manjka ključ ali ni odgovoril).",
      ukrep: izbrani,
      utemeljitev: ai?.utemeljitev ?? "Privzeti varni ukrep: ponovni zagon.",
      izvedeno,
      vir: ai ? "ai" : "privzeto",
    };

    log("warn", "samopopravilo", { vzrok: d.vzrok, ukrep: d.ukrep, izvedeno: d.izvedeno });

    // History, newest first, capped — the console reads this.
    const { data } = await db
      .from("avtonet_statistika")
      .select("podatki")
      .eq("kljuc", "samopopravila")
      .maybeSingle();
    const prej = ((data as { podatki: { zapisi?: Diagnoza[] } } | null)?.podatki?.zapisi ?? []).slice(
      0,
      29
    );
    await db.from("avtonet_statistika").upsert({
      kljuc: "samopopravila",
      podatki: { zapisi: [d, ...prej], dokaziZadnji: dokazi },
      izracunano: new Date().toISOString(),
    });

    return d;
  } catch (err) {
    log("error", "samopopravilo ni uspelo", {
      napaka: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
