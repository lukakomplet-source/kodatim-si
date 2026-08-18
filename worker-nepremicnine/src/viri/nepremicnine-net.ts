import type { Page } from "playwright";
import { cenaIz, izOpisa } from "../parse.js";
import type { NormaliziranOglas } from "../db.js";

/**
 * Adapter za nepremicnine.net — bere SEZNAME, ne detajlov.
 *
 * Kartica na seznamu nosi vse ključno (mikropodatki Offer + opisna vrstica z
 * m², letom, zemljiščem, etažnostjo), detajlno stran pa varuje Cloudflareovo
 * preverjanje, ki hitre obiske ustavi. Zato faza 1 detajlov sploh ne odpira —
 * enak dvo-fazni model kot pri avto.netu, kjer se je izkazal.
 *
 * robots.txt: `Allow: /` s Content-Signal search=yes, ai-train=no. To spoštujemo
 * dobesedno: gradimo iskalni indeks, opisov ne pošiljamo v modele, slik ne
 * kopiramo (hranimo URL) in oglas vedno kaže na izvirnik.
 */

export const VIR = "nepremicnine.net";
export const OMEJITVE = { zamikMs: 6000, hkratnih: 1 };
export const PRICAKOVAN_RAZPON: [number, number] = [3000, 80000];

export const REGIJE = [
  "ljubljana-mesto", "ljubljana-okolica", "podravska", "savinjska", "gorenjska",
  "dolenjska", "notranjska", "obalno-kraska", "goriska", "koroska",
  "pomurska", "posavska", "zasavska",
];

export const TIPI = ["stanovanje", "hisa", "posest", "poslovni-prostor", "garaza", "vikend", "pocitniski-objekt"];
export const POSLI = ["prodaja", "oddaja"] as const;

export type Rezina = { posel: (typeof POSLI)[number]; regija: string; tip: string };

export function vseRezine(): Rezina[] {
  const out: Rezina[] = [];
  for (const posel of POSLI) for (const regija of REGIJE) for (const tip of TIPI) out.push({ posel, regija, tip });
  return out;
}

export function seznamUrl(r: Rezina, stran: number): string {
  const osnova = `https://www.nepremicnine.net/oglasi-${r.posel}/${r.regija}/${r.tip}/`;
  return stran <= 1 ? osnova : `${osnova}${stran}/`;
}

export type SurovaKartica = {
  url: string;
  virId: string;
  lokacija: string | null;
  naslovVrstica: string | null;
  opis: string | null;
  cenaBesedilo: string | null;
  telefon: string | null;
  agencija: string | null;
  slika: string | null;
  stSlik: number | null;
};

/** Prebere kartice s trenutno naložene strani seznama. */
export async function preberiSeznam(page: Page): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null }> {
  return page.evaluate(() => {
    const kartice: SurovaKartica[] = [];
    for (const el of Array.from(document.querySelectorAll("div.property-box"))) {
      const url =
        el.querySelector('meta[itemprop="mainEntityOfPage"]')?.getAttribute("content") ??
        (el.querySelector('a[href*="_"]') as HTMLAnchorElement | null)?.href ??
        null;
      if (!url) continue;
      const virId = url.match(/_(\d+)\/?$/)?.[1];
      if (!virId) continue;

      const cena = el.querySelector('[itemprop="price"]')?.getAttribute("content") ?? null;
      const agencija = el.querySelector('[itemprop="seller"] [itemprop="name"]')?.getAttribute("content")
        ?? el.querySelector('[itemprop="seller"] [itemprop="name"]')?.textContent ?? null;
      const besedilo = (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();

      kartice.push({
        url,
        virId,
        lokacija: (el.querySelector("h2, .title, .posr") as HTMLElement | null)?.innerText?.trim() ?? null,
        naslovVrstica: besedilo.match(/(?:Prodaja|Oddaja|Najem):\s*([^,]+(?:,\s*[^,]+)?)/)?.[0] ?? null,
        opis: el.querySelector('[itemprop="description"], [itemprop="disambiguatingDescription"]')?.textContent?.trim() ?? null,
        // Mikropodatek pride kot golo decimalno število ("3850000.00") — brez
        // pripete valute, da ga normaliziraj lahko loči od slovenskega zapisa.
        cenaBesedilo: cena ?? besedilo.match(/[\d.]+,\d{2}\s*€/)?.[0] ?? null,
        telefon: (el.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null)?.href?.replace("tel:", "") ?? null,
        agencija: agencija?.trim() || null,
        slika: el.querySelector("img[data-src], img[src*='img.nepremicnine']")?.getAttribute("data-src")
          ?? el.querySelector("img[src*='img.nepremicnine']")?.getAttribute("src") ?? null,
        stSlik: Array.from(el.querySelectorAll("img[src*='img.nepremicnine'], img[data-src*='img.nepremicnine']")).length || null,
      });
    }
    // paginacija: "1/23"
    const stevec = document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/);
    const zadnjaStran = stevec ? Number(stevec[2]) : null;
    return { kartice, zadnjaStran };
  }) as Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null }>;
}

/** Slovenska velika začetnica krajev ("BISTRICA OB DRAVI" -> "Bistrica ob Dravi"). */
function lepKraj(v: string | null): string | null {
  if (!v) return null;
  const male = new Set(["ob", "na", "pri", "v", "za", "pod", "nad", "sv."]);
  return v
    .toLowerCase()
    .split(/\s+/)
    .map((b, i) => (i > 0 && male.has(b) ? b : b.charAt(0).toUpperCase() + b.slice(1)))
    .join(" ")
    .trim();
}

export function normaliziraj(r: SurovaKartica, rezina: Rezina): NormaliziranOglas {
  const opis = r.opis ?? "";
  const iz = izOpisa(opis);
  // podtip iz naslovne vrstice: "Prodaja: Hiša, Samostojna" -> "samostojna"
  // "Prodaja: Hiša, Samostojna BISTRICA OB DRAVI 208..." — podtip je do prve
  // besede iz samih velikih črk (lokacija) ali do prve številke.
  const podtipSurov = r.naslovVrstica?.split(",")[1]?.trim() ?? null;
  const podtip = podtipSurov
    ? podtipSurov.split(/s+/).filter((b) => !/^[A-ZČŠŽ]{2,}$/.test(b) && !/^d/.test(b)).join(" ").toLowerCase().trim() || null
    : null;

  return {
    vir: VIR,
    virId: r.virId,
    url: r.url,
    naslov: r.naslovVrstica?.replace(/^(?:Prodaja|Oddaja|Najem):\s*/, "") ?? null,
    tip: rezina.tip.replace(/-/g, "_"),
    podtip,
    posel: rezina.posel,
    regija: rezina.regija,
    kraj: lepKraj(r.lokacija),
    cenaEur: (() => {
      if (!r.cenaBesedilo) return null;
      const cist = r.cenaBesedilo.replace(/\s*€\s*$/, "").trim();
      // Mikropodatek uporablja decimalno PIKO ("3850000.00"), slovenski zapis pa
      // pike kot tisočice ("3.850.000,00 €"). Branje enega s pravili drugega je
      // naredilo cene ×100 — zato sta poti tu izrecno ločeni.
      if (/^\d+(?:\.\d{1,2})?$/.test(cist)) return Number(cist);
      return cenaIz(r.cenaBesedilo);
    })(),
    povrsinaM2: iz.povrsinaM2,
    zemljisceM2: iz.zemljisceM2,
    letoIzgradnje: iz.letoIzgradnje,
    letoAdaptacije: iz.letoAdaptacije,
    nadstropje: iz.nadstropje,
    vecEnot: iz.vecEnot,
    stEnot: iz.stEnot,
    stEnotOcena: iz.stEnotOcena,
    loceneKuhinje: iz.loceneKuhinje,
    looceniVhodi: iz.looceniVhodi,
    zaObnovo: iz.zaObnovo,
    zaInvesticijo: iz.zaInvesticijo,
    opis: opis || null,
    prodajalec: r.agencija ? "agencija" : "zasebnik",
    agencija: r.agencija,
    telefon: r.telefon,
    slikaUrl: r.slika,
    stSlik: r.stSlik,
    raw: r as unknown as Record<string, unknown>,
  };
}
