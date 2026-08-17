import "server-only";
import { DOSEG, DOSEG_PREDPONE } from "./aiScope";

/**
 * Which files the model should be looking at.
 *
 * This is the difference between a useful answer and a plausible one. Ranking by
 * FILENAME alone — the first version — answered a question about the Posli page
 * by editing FiltriVozilForm.tsx, because the request contained the word "filter".
 * A person would have done the obvious thing instead: open the page the user is
 * on, and grep for the text they quoted.
 *
 * So that is what this does. Three signals, in order of how much they are worth:
 *
 *   1. the page the request came from — its own directory is almost always where
 *      the change belongs;
 *   2. the literal strings from the request found in file CONTENT — Slovenian
 *      interface text ("Vse znamke", "fizičnih oseb") is a near-unique locator;
 *   3. words in the path, which is the weak signal the old version used alone.
 *
 * The whole in-scope tree is under a megabyte, so reading it to score content is
 * a few hundred milliseconds on a local disk — cheap enough that guessing is not
 * worth defending.
 */

export type Zadetek = { pot: string; ocena: number; zadetkov: number };

/** Words worth searching for: long enough to be distinctive, not stop words. */
const STOP = new Set([
  "tudi",
  "pač",
  "pa",
  "da",
  "to",
  "naj",
  "kaj",
  "kako",
  "more",
  "mora",
  "bit",
  "biti",
  "sam",
  "samo",
  "tam",
  "tuki",
  "tule",
  "zdaj",
  "zdj",
  "potem",
  "pol",
  "recimo",
  "kolko",
  "koliko",
  "nima",
  "nemore",
  "prosim",
  "stran",
  "strani",
]);

function besedeIskanja(zahteva: string): string[] {
  const surove = zahteva
    .toLowerCase()
    .replace(/[„“"'(),.!?:;]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return [...new Set(surove)].slice(0, 12);
}

/** Directory of the page the user was on, e.g. /avtonet/posli → …/avtonet/posli/ */
function mapaStrani(pot: string | null): string | null {
  if (!pot) return null;
  const del = pot.replace(/^\/+|\/+$/g, "").split("/");
  if (del[0] !== "avtonet") return null;
  const pod = del[1];
  return pod ? `src/app/(demo)/avtonet/${pod}/` : "src/app/(demo)/avtonet/";
}

export type Orodja = {
  seznamDatotek(): Promise<string[]>;
  preberiVarno(pot: string): Promise<string | null>;
};

/**
 * Ranks the in-scope files for one request.
 *
 * @param pot  The page the request was written on, when known. Worth more than
 *   every other signal combined: "popravi tole" means the page in front of them.
 */
export async function najdiRelevantne(
  orodja: Orodja,
  zahteva: string,
  pot: string | null,
  najvec = 12
): Promise<Zadetek[]> {
  const datoteke = await orodja.seznamDatotek();
  const besede = besedeIskanja(zahteva);
  const mapa = mapaStrani(pot);

  const zadetki: Zadetek[] = [];
  for (const p of datoteke) {
    let ocena = 0;
    const spodaj = p.toLowerCase();

    if (mapa && p.startsWith(mapa)) ocena += 60;
    // The shared pieces of a page live one level up (nav, filter forms, layout).
    if (mapa && !p.startsWith(mapa) && p.startsWith("src/app/(demo)/avtonet/")) ocena += 4;
    for (const b of besede) if (spodaj.includes(b)) ocena += 8;

    let zadetkov = 0;
    const vsebina = await orodja.preberiVarno(p);
    if (vsebina) {
      const nizka = vsebina.toLowerCase();
      for (const b of besede) {
        const n = nizka.split(b).length - 1;
        if (n > 0) {
          zadetkov += n;
          // Diminishing: a file that mentions the word forty times is not forty
          // times more relevant than one that mentions it twice.
          ocena += Math.min(18, 6 + Math.log2(n) * 4);
        }
      }
    }

    if (ocena > 0) zadetki.push({ pot: p, ocena, zadetkov });
  }

  zadetki.sort((a, b) => b.ocena - a.ocena);

  // Always include the page's own files, even if nothing matched textually: a
  // request about a page that mentions none of its identifiers is common ("tole
  // je narobe"), and answering it without reading the page is guessing.
  if (mapa) {
    for (const p of datoteke) {
      if (p.startsWith(mapa) && !zadetki.some((z) => z.pot === p)) {
        zadetki.unshift({ pot: p, ocena: 60, zadetkov: 0 });
      }
    }
  }

  return zadetki.slice(0, najvec);
}

/** The ranked files as prompt text, newest-first by relevance. */
export async function sestaviKontekst(
  orodja: Orodja,
  zadetki: Zadetek[],
  najvecZnakovNaDatoteko = 12_000
): Promise<string> {
  const deli: string[] = [];
  for (const z of zadetki) {
    const vsebina = await orodja.preberiVarno(z.pot);
    if (vsebina === null) continue;
    const kos =
      vsebina.length > najvecZnakovNaDatoteko
        ? `${vsebina.slice(0, najvecZnakovNaDatoteko)}\n/* … skrajšano … */`
        : vsebina;
    deli.push(`--- ${z.pot} ---\n${kos}`);
  }
  return deli.join("\n\n");
}

/** Minimal git-backed tools, for callers that do not build their own. */
export async function pripraviBralnik(): Promise<Orodja> {
  const [{ execFile }, fs, { promisify }, { join }] = await Promise.all([
    import("node:child_process"),
    import("node:fs/promises"),
    import("node:util"),
    import("node:path"),
  ]);
  const izvedi = promisify(execFile);
  const korenina = process.cwd();

  return {
    async seznamDatotek() {
      const { stdout } = await izvedi(
        "git",
        ["ls-files", ...[...DOSEG, ...DOSEG_PREDPONE].map((d) => `${d}*`)],
        { cwd: korenina, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
      );
      return stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    },
    async preberiVarno(pot: string) {
      try {
        return await fs.readFile(join(korenina, pot), "utf8");
      } catch {
        return null;
      }
    },
  };
}
