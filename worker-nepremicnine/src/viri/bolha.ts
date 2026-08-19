import type { Page } from "playwright";
import { cenaIz, izOpisa } from "../parse.js";
import type { NormaliziranOglas } from "../db.js";
import type { Rezina as BazniRezina, SurovaKartica, VirAdapter } from "./vmesnik.js";

/**
 * Adapter za bolha.com (kategorija Nepremičnine).
 *
 * robots.txt (13. 7. 2026): za `User-agent: *` so prepovedani /search,
 * /hitro-iskanje, slikovni endpointi (/image-*) in ctl= poizvedbe — KATEGORIJSKE
 * strani (/prodaja-hise?page=N) pa so dovoljene in samo te beremo. Slik zato
 * ne kopiramo (politika "referenca"), shranimo le URL iz že prejetega HTML.
 *
 * Kartica na seznamu je revnejša kot pri nepremicnine.net: naslov, lokacija,
 * cena, datum objave, slika. Površina je pogosto v naslovu ("94.40 m2" — z
 * decimalno PIKO), leta in zemljišča na seznamu ni. "Iščem/Kupim" oglasi
 * povpraševanj se preskočijo že pri branju.
 */

export const VIR = "bolha.com";

type BolhaRezina = BazniRezina & { pot: string; posel: "prodaja" | "oddaja"; tip: string };

const KATEGORIJE: BolhaRezina[] = [
  { oznaka: "prodaja/hisa", pot: "prodaja-hise", posel: "prodaja", tip: "hisa" },
  { oznaka: "oddaja/hisa", pot: "oddaja-hise", posel: "oddaja", tip: "hisa" },
  { oznaka: "prodaja/stanovanje", pot: "prodaja-stanovanja", posel: "prodaja", tip: "stanovanje" },
  { oznaka: "oddaja/stanovanje", pot: "oddaja-stanovanja", posel: "oddaja", tip: "stanovanje" },
  { oznaka: "prodaja/posest", pot: "prodaja-posesti", posel: "prodaja", tip: "posest" },
  { oznaka: "oddaja/posest", pot: "oddaja-posesti", posel: "oddaja", tip: "posest" },
  { oznaka: "prodaja/poslovni_prostor", pot: "poslovni-prostori-prodaja", posel: "prodaja", tip: "poslovni_prostor" },
  { oznaka: "oddaja/poslovni_prostor", pot: "poslovni-prostori-oddaja", posel: "oddaja", tip: "poslovni_prostor" },
  { oznaka: "prodaja/pocitniski_objekt", pot: "pocitniski-objekt", posel: "prodaja", tip: "pocitniski_objekt" },
  { oznaka: "prodaja/garaza", pot: "prodaja-garaze", posel: "prodaja", tip: "garaza" },
  { oznaka: "oddaja/garaza", pot: "oddaja-garaze", posel: "oddaja", tip: "garaza" },
];

function seznamUrl(r: BolhaRezina, stran: number): string {
  const osnova = `https://www.bolha.com/${r.pot}`;
  return stran <= 1 ? osnova : `${osnova}?page=${stran}`;
}

/** Prebere kartice s trenutno naložene kategorijske strani. */
async function preberiSeznam(page: Page): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null }> {
  return page.evaluate(() => {
    const kartice: SurovaKartica[] = [];
    for (const li of Array.from(document.querySelectorAll("li.EntityList-item"))) {
      // Izpostavljene trgovine imajo podsezname brez cen — njihovi oglasi se
      // pojavijo tudi kot navadne kartice, zato podseznam preskočimo.
      if (li.classList.contains("is-withSubitems")) continue;
      const povezava = li.querySelector('h3.entity-title a[href*="-oglas-"]') as HTMLAnchorElement | null;
      if (!povezava) continue;
      const url = povezava.href;
      const virId = url.match(/-oglas-(\d+)/)?.[1];
      if (!virId) continue;

      const naslov = povezava.textContent?.trim() ?? null;
      // Povpraševanja ("Iščem hišo", "Kupimo stanovanje") niso ponudba.
      if (naslov && /\b(i[šs][čc]em|kupim|kupimo|najamem|najamemo|zamenjam)\b/i.test(naslov)) continue;

      const opisEl = li.querySelector(".entity-description") as HTMLElement | null;
      const opis = opisEl?.innerText?.replace(/\s+/g, " ").trim() ?? null;
      const lokacija = opis?.match(/Lokacija:\s*([^|]+?)(?:$|Objavljen)/)?.[1]?.trim() ?? null;

      kartice.push({
        url,
        virId,
        lokacija,
        naslovVrstica: naslov,
        opis,
        cenaBesedilo: (li.querySelector(".entity-prices .price") as HTMLElement | null)?.innerText?.trim() ?? null,
        telefon: null,
        agencija: null,
        slika: li.querySelector("img.entity-thumbnail-img")?.getAttribute("src") ?? null,
        stSlik: null,
      });
    }
    let zadnjaStran: number | null = null;
    for (const g of Array.from(document.querySelectorAll(".Pagination-link"))) {
      const n = Number((g.getAttribute("data-href") ?? "").match(/[?&]page=(\d+)/)?.[1] ?? NaN);
      if (Number.isFinite(n) && (zadnjaStran === null || n > zadnjaStran)) zadnjaStran = n;
    }
    return { kartice, zadnjaStran };
  }) as Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null }>;
}

/** "94.40 m2" (pika = decimalka) ali "94,40 m2" ali "160 m2" -> 94.4 / 160. */
export function povrsinaIzNaslova(naslov: string | null): number | null {
  const m = naslov?.match(/([\d]+(?:[.,]\d{1,2})?)\s*m2\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 1 && n < 100000 ? n : null;
}

function normaliziraj(r: SurovaKartica, rezina: BolhaRezina): NormaliziranOglas {
  const opis = r.opis ?? "";
  const iz = izOpisa(opis);
  const cena = r.cenaBesedilo ? cenaIz(r.cenaBesedilo) : null;
  // "Maribor, Ostalo" -> kraj "Maribor"; "Ptuj okolica, Cirkulane" pusti celo.
  const kraj = r.lokacija?.replace(/,\s*Ostalo\s*$/i, "").trim() || null;

  return {
    vir: VIR,
    virId: r.virId,
    url: r.url,
    naslov: r.naslovVrstica,
    tip: rezina.tip,
    podtip: null,
    posel: rezina.posel,
    regija: null, // seznam Bolhe regije ne pove; koordinate pridejo iz kraja
    kraj,
    cenaEur: cena !== null && cena > 0 ? cena : null,
    povrsinaM2: iz.povrsinaM2 ?? povrsinaIzNaslova(r.naslovVrstica),
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
    prodajalec: null,
    agencija: null,
    telefon: null,
    slikaUrl: r.slika,
    stSlik: r.stSlik,
    raw: r as unknown as Record<string, unknown>,
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  omejitve: { zamikMs: 6000 },
  pricakovanRazpon: [3000, 40000],
  slikePolitika: "referenca",
  svezKontekstNaStran: true,
  rezine: () => KATEGORIJE,
  seznamUrl: (r, stran) => seznamUrl(r as BolhaRezina, stran),
  preberiSeznam,
  normaliziraj: (k, r) => normaliziraj(k, r as BolhaRezina),
};
