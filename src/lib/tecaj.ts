import "server-only";
import { readdir, readFile } from "node:fs/promises";

/**
 * Tečaj »od klica do naročnine« za panik gumb (3. 11. 2026): lekcije so markdown datoteke v
 * Documents\VIDEO-UCENJE\TECAJ-PANIK (povzetki iz prepisov videov, vsaka z virom). Stran teče na tem računalniku,
 * zato jih bere naravnost z diska; nova ali popravljena lekcija se pokaže brez objave strani.
 */

const MAPA = process.env.TECAJ_PANIK_MAPA ?? "C:\\Users\\lukak\\Documents\\VIDEO-UCENJE\\TECAJ-PANIK";

export type Lekcija = { kljuc: string; naslov: string; besedilo: string };

/** Vse lekcije po vrsti (00-KAZALO prva); null, ko mape ni. */
export async function preberiTecaj(): Promise<Lekcija[] | null> {
  let imena: string[];
  try {
    imena = (await readdir(MAPA)).filter((i) => /^\d\d-[a-z0-9-]+\.md$/i.test(i)).sort();
  } catch {
    return null;
  }
  const lekcije = await Promise.all(
    imena.map(async (ime) => {
      const besedilo = await readFile(`${MAPA}\\${ime}`, "utf8").catch(() => "");
      const naslov = besedilo.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ime;
      return { kljuc: ime.slice(0, 2), naslov, besedilo };
    }),
  );
  return lekcije.filter((l) => l.besedilo);
}

export type Blok =
  | { vrsta: "naslov"; raven: 1 | 2 | 3; besedilo: string }
  | { vrsta: "odstavek"; besedilo: string }
  | { vrsta: "seznam"; urejen: boolean; tocke: string[] }
  | { vrsta: "tabela"; vrstice: string[][] };

/** Preprost markdown (naslovi, odstavki, seznami, tabele) v bloke; vrstični poudarki ostanejo v besedilu. */
export function vBloke(md: string): Blok[] {
  const bloki: Blok[] = [];
  let odstavek: string[] = [];
  const zakljuci = () => {
    if (odstavek.length) bloki.push({ vrsta: "odstavek", besedilo: odstavek.join(" ") });
    odstavek = [];
  };
  for (const surova of md.replace(/\r\n/g, "\n").split("\n")) {
    const v = surova.trim();
    const naslov = v.match(/^(#{1,3})\s+(.+)$/);
    const tocka = v.match(/^(?:[-*]|(\d+)\.)\s+(.+)$/);
    const zadnji = bloki[bloki.length - 1];
    if (!v) {
      zakljuci();
    } else if (naslov) {
      zakljuci();
      bloki.push({ vrsta: "naslov", raven: naslov[1].length as 1 | 2 | 3, besedilo: naslov[2] });
    } else if (tocka) {
      zakljuci();
      const urejen = !!tocka[1];
      if (zadnji?.vrsta === "seznam" && zadnji.urejen === urejen) zadnji.tocke.push(tocka[2]);
      else bloki.push({ vrsta: "seznam", urejen, tocke: [tocka[2]] });
    } else if (v.startsWith("|")) {
      zakljuci();
      if (/^\|[\s:|-]+\|$/.test(v)) continue;
      const celice = v.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (zadnji?.vrsta === "tabela") zadnji.vrstice.push(celice);
      else bloki.push({ vrsta: "tabela", vrstice: [celice] });
    } else {
      odstavek.push(v);
    }
  }
  zakljuci();
  return bloki;
}
