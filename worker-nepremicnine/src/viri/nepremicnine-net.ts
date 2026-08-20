import type { Page } from "playwright";
import { cenaIz, izOpisa } from "../parse.js";
import type { NormaliziranOglas } from "../db.js";
import type { Detajl, Rezina as BazniRezina, SurovaKartica, VirAdapter } from "./vmesnik.js";

export type { SurovaKartica } from "./vmesnik.js";

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

export type Rezina = BazniRezina & { posel: (typeof POSLI)[number]; regija: string; tip: string };

export function vseRezine(): Rezina[] {
  const out: Rezina[] = [];
  for (const posel of POSLI)
    for (const regija of REGIJE)
      for (const tip of TIPI) out.push({ oznaka: `${posel}/${regija}/${tip}`, posel, regija, tip });
  return out;
}

export function seznamUrl(r: Rezina, stran: number): string {
  const osnova = `https://www.nepremicnine.net/oglasi-${r.posel}/${r.regija}/${r.tip}/`;
  return stran <= 1 ? osnova : `${osnova}${stran}/`;
}

/** Prebere kartice s trenutno naložene strani seznama. */
export async function preberiSeznam(page: Page): Promise<{
  kartice: SurovaKartica[];
  zadnjaStran: number | null;
  skupajZadetkov: number | null;
}> {
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
    // Vir sam pove, koliko oglasov ustreza rezini: "Št. ustreznih oglasov: 0".
    // Nič je nič — in ne blokada.
    const cnt = (document.querySelector(".oglasi_cnt") as HTMLElement | null)?.innerText ?? "";
    // Vzorec se MORA začeti s števko: "Št. ustreznih oglasov: 385" ima piko že
    // v okrajšavi "Št.", zato je [\d.]+ pobral njo in vrnil 0 — polna
    // kategorija bi se predstavila kot prazna. Ista past kot pri "Št. spalnic".
    const najdeno = cnt.match(/(\d[\d.]*)/);
    const skupajZadetkov = najdeno ? Number(najdeno[1].replace(/\./g, "")) : null;
    return { kartice, zadnjaStran, skupajZadetkov: Number.isFinite(skupajZadetkov as number) ? skupajZadetkov : null };
  }) as Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null }>;
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

/**
 * 2. FAZA — detajlna stran oglasa.
 *
 * Kar je tu in česar na seznamu ni: število spalnic in kopalnic, energetska
 * izkaznica, ogrevanje, oprema, parkirišče, cela galerija (izmerjeno 20 slik
 * proti eni na kartici) in poln opis. Brez tega filtriranje po teh poljih ni
 * mogoče — kar je bila glavna zahteva.
 *
 * Struktura je preverjena na resnični strani (oglas 7384060, 20. 8. 2026), ne
 * uganjena: `ul#atributi > li` je seznam kratkih trditev v prosti obliki
 * ("Št. spalnic: 2", "Balkon", "Ogrevanje na elektriko", "EI: Izračun ni
 * mogoč"), zato se bere z vzorci nad besedilom in ne s pozicijskimi selektorji,
 * ki bi jih vsaka preureditev razbila.
 *
 * Vse, česar stran ne pove, ostane prazno. Galerija se hrani kot URL-ji na
 * izvirnik; datotek ne kopiramo.
 *
 * DELITEV DELA: v brskalniku se samo POBERE besedilo, razčleni pa se v Node.
 * Dvoje razlogov. Prvi je praktičen — tsx/esbuild v `page.evaluate` prevede
 * pomožne funkcije v klic `__name`, ki v brskalniku ne obstaja, in cela
 * funkcija pade z "ReferenceError". Drugi je boljši: razčlenitev, ki teče v
 * Node, se da testirati brez brskalnika in brez omrežja.
 */

/** Kar brskalnik vrne — samo besedilo, brez logike. */
export type SurovDetajl = {
  vrstice: string[];
  slike: string[];
  prodajalec: string | null;
  cena: string | null;
  telefon: string | null;
  opis: string | null;
};

/**
 * Razčlenitev seznama lastnosti. Vrstice so proste povedi ("Št. spalnic: 2",
 * "Balkon", "Ogrevanje na elektriko"), zato se bere z vzorci nad besedilom in
 * ne s pozicijo v seznamu, ki jo vsaka preureditev strani razbije.
 */
export function detajlIzSurovega(s: SurovDetajl): Detajl {
  const vrstice = s.vrstice;
  const najdi = (re: RegExp): string | null => vrstice.find((v) => re.test(v)) ?? null;
  /** Vse ujemajoče vrstice, združene ("Ogrevanje na elektriko, na drva"). */
  const vse = (re: RegExp): string | null => {
    const v = vrstice.filter((x) => re.test(x));
    return v.length > 0 ? v.join(", ") : null;
  };
  const stevilka = (re: RegExp): number | null => {
    const v = najdi(re);
    // Vzorec se mora začeti s ŠTEVKO. Prejšnji `[\d.]+` je v "Št. spalnic: 2"
    // pobral piko iz okrajšave "Št." in vrnil 0 — tiho, brez napake, za vsak
    // tak oglas. Zato je prva števka obvezna.
    const m = v?.match(/(\d[\d.]*(?:,\d+)?)/);
    if (!m) return null;
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  /** Zastavica: prisotna vrstica pomeni "da", odsotna pomeni "ne vemo". */
  const zastavica = (re: RegExp): boolean | null => (najdi(re) ? true : null);

  const lastnosti: Record<string, string> = {};
  for (const v of vrstice) {
    const m = v.match(/^([^:]{2,40}):\s*(.+)$/);
    if (m) lastnosti[m[1].trim()] = m[2].trim();
    else lastnosti[v] = "da";
  }

  const cena = s.cena !== null && /^\d+(?:\.\d+)?$/.test(s.cena) ? Number(s.cena) : null;
  const slike = [...new Set(s.slike)];

  return {
    povrsinaM2: stevilka(/^Velikost:/i),
    zemljisceM2: stevilka(/^Zemljišče:/i),
    stSob: stevilka(/^Št\.?\s*sob:/i),
    stSpalnic: stevilka(/^Št\.?\s*spalnic:/i),
    stKopalnic: stevilka(/^Št\.?\s*kopalnic:/i),
    nadstropje: najdi(/^Nadstropje:/i)?.replace(/^Nadstropje:\s*/i, "") ?? null,
    letoIzgradnje: stevilka(/^Zgrajen(?:o|a)?\s*l\./i),
    letoAdaptacije: stevilka(/^Adaptiran(?:o|a)?\s*l\./i),
    // Energetska izkaznica ima pri tem viru DVA zapisa: "EI: Izračun ni mogoč"
    // in "D (85 - 120 kWh/m2a)". Iskanje samo po "EI:" je drugega spregledalo.
    // Vrednost se pusti dobesedno — izluščen "razred D" iz besedila, ki ga ne
    // vsebuje, bi bil izmišljotina.
    energetskiRazred: najdi(/^EI:|kWh\/m2a/i)?.replace(/^EI:\s*/i, "") ?? null,
    ogrevanje: vse(/ogrevanj/i),
    opremljenost: najdi(/opremljen/i),
    stanje: vse(/^(?:Novogradnja|Vseljivo|V izgradnji|Za adaptacijo|Za rušenje)/i),
    parkirno: vse(/parkirn|garaž/i),
    balkon: zastavica(/^Balkon\b/i),
    terasa: zastavica(/^Terasa\b/i),
    vrt: zastavica(/^(?:Vrt|Atrij)\b/i),
    klet: zastavica(/^(?:Klet|Shramba)\b/i),
    dvigalo: zastavica(/^Dvigalo\b/i),
    lastnistvo: najdi(/lastnišk/i),
    agencija: s.prodajalec && !/zasebna ponudba/i.test(s.prodajalec) ? s.prodajalec : null,
    telefon: s.telefon?.replace(/^tel:/, "").trim() || null,
    opis: s.opis || null,
    cenaEur: cena,
    slikeUrls: slike.length > 0 ? slike : null,
    lastnosti,
  };
}

export async function preberiDetajl(page: Page): Promise<Detajl> {
  const surovo = (await page.evaluate(() => ({
    vrstice: Array.from(document.querySelectorAll("ul#atributi li"))
      .map((li) => (li as HTMLElement).innerText.replace(/\s+/g, " ").trim())
      .filter((v) => v.length > 0),
    // Galerija: vsaka slika je povezava fancybox na izvirnik. Slick podvoji
    // prve in zadnje diapozitive (slick-cloned) — podvojene odstrani Node.
    slike: Array.from(document.querySelectorAll("a[data-fancybox]"))
      .map((a) => a.getAttribute("data-src") ?? (a as HTMLAnchorElement).href ?? "")
      .filter((u) => u.includes("img.nepremicnine.net")),
    prodajalec:
      document.querySelector('[itemprop="seller"] [itemprop="name"]')?.getAttribute("content") ??
      document.querySelector('[itemprop="seller"] [itemprop="name"]')?.textContent?.trim() ??
      null,
    cena: document.querySelector('meta[itemprop="price"]')?.getAttribute("content") ?? null,
    telefon:
      (document.querySelector('#agent-phones a[href^="tel:"]') as HTMLAnchorElement | null)?.getAttribute("href") ??
      null,
    opis:
      (document.querySelector('[itemprop="disambiguatingDescription"]') as HTMLElement | null)?.innerText?.trim() ??
      null,
  }))) as SurovDetajl;
  return detajlIzSurovega(surovo);
}

/**
 * Formalni adapter za register virov. Cloudflare tega vira pusti skozi PRVO
 * zahtevo konteksta, vsako naslednjo pošlje na izziv — zato svež kontekst za
 * vsako stran. Slike so izrecno "referenca" (robots.txt use=reference).
 */
export const adapter: VirAdapter = {
  vir: VIR,
  omejitve: OMEJITVE,
  pricakovanRazpon: PRICAKOVAN_RAZPON,
  slikePolitika: "referenca",
  svezKontekstNaStran: true,
  crawlDelayS: 0,
  pravno:
    "Pogoji (avg. 2020) prepovedujejo meta-iskanje in robote; izjema velja samo za SPLOŠNE iskalnike. Za komercialno rabo je predviden predhoden dogovor z MEGANET. Slik ne kopiramo, oglas vedno kaže na izvirnik.",
  // 2. faza je pri tem viru dražja od seznamov (Cloudflare pusti skozi prvo
  // zahtevo vsakega konteksta), zato majhna kvota in isti razmik kot seznami.
  detajli: { zamikMs: 6000, kvota: 250, preberi: preberiDetajl },
  rezine: vseRezine,
  seznamUrl: (r, stran) => seznamUrl(r as Rezina, stran),
  preberiSeznam,
  normaliziraj: (k, r) => normaliziraj(k, r as Rezina),
};
