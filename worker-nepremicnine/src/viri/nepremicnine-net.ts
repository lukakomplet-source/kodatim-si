import type { Page } from "playwright";
import { cenaIz, izOpisa, stevilo } from "../parse.js";
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

      const besediloKartice = (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();
      /**
       * POVPRAŠEVANJA NISO PONUDBA. Med oglasi za prodajo se znajdejo tudi
       * "Kupim nezazidljivo zemljišče … Cena: max. 50,00 EUR" — kupec, ki
       * navaja svojo zgornjo mejo. Če jih zajamemo, v bazo pridejo hiše za
       * 50 € in vsaka statistika je pokvarjena. "Cena: max." je natančen
       * podpis takega oglasa.
       */
      if (/cena:\s*max\.?/i.test(besediloKartice) && /\b(kupim|kupimo|i[šs][čc]em|najamem)\b/i.test(besediloKartice)) {
        continue;
      }

      const cena = el.querySelector('[itemprop="price"]')?.getAttribute("content") ?? null;
      const agencija = el.querySelector('[itemprop="seller"] [itemprop="name"]')?.getAttribute("content")
        ?? el.querySelector('[itemprop="seller"] [itemprop="name"]')?.textContent ?? null;
      const besedilo = besediloKartice;

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
    /**
     * Koliko oglasov ustreza rezini — vir to pove sam: "Št. ustreznih
     * oglasov: 385". Vzorec se MORA začeti s števko, ker ima okrajšava "Št."
     * piko in jo je `[\d.]+` pobral namesto številke (polna kategorija se je
     * predstavila kot prazna — ista past kot pri "Št. spalnic: 2").
     */
    const cnt = (document.querySelector(".oglasi_cnt") as HTMLElement | null)?.innerText ?? "";
    const najdeno = cnt.match(/(\d[\d.]*)/);
    const skupaj = najdeno ? Number(najdeno[1].replace(/\./g, "")) : null;
    const skupajZadetkov = skupaj !== null && Number.isFinite(skupaj) ? skupaj : null;

    /**
     * ZADNJA STRAN SE IZRAČUNA, NE PREBERE.
     *
     * Prej se je brala z `document.body.innerText.match(/(\d+)\s*\/\s*(\d+)/)`
     * — torej iz prvega zapisa "x/y" kjer koli v besedilu strani. Izmerjeno na
     * osmih zaporednih straneh iste kategorije: 10, 3, 6, 7, 3, 4, 3, 3.
     * Vsakič druga številka in nobena ni bila prava. Zanka se je ob "3"
     * ustavila pri tretji strani od šestnajstih, zato je bilo v bazi 128
     * oglasov od 385, ki jih vir premore — dve tretjini trga sta tiho manjkali
     * in v nobenem dnevniku to ni bilo videti kot napaka.
     *
     * Zdaj: skupno število deljeno z velikostjo strani. Pri delni zadnji
     * strani (manj kartic) izračun raje PRECENI število strani — odvečna
     * stran stane eno zahtevo, premalo strani pa stane podatke; zanka se
     * ustavi sama, ko dve strani zapored ne prineseta nič novega.
     */
    const naStran = kartice.length > 0 ? Math.min(kartice.length, 25) : 25;
    const zadnjaStran = skupajZadetkov !== null && skupajZadetkov > 0 ? Math.ceil(skupajZadetkov / naStran) : null;

    return { kartice, zadnjaStran, skupajZadetkov };
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

/**
 * CENA OGLASA — in past, ki je v bazo spravila zemljišča za 0,40 €.
 *
 * Mikropodatek `itemprop="price"` nosi golo število brez enote. Pri zemljiščih
 * je to pogosto cena NA KVADRATNI METER: oglas 7304321 (Slavina, 27.663 m²) je
 * imel `price = 0.40`, kar je v bazi postalo "parcela za 40 centov". Takih
 * vrstic je bilo več deset in vsaka je vlekla mediane €/m² navzdol.
 *
 * Enoto pove opis vira sam: "Cena: 0,40 EUR/m2". Kadar je cena na enoto in
 * poznamo površino, je skupna cena zmnožek dveh objavljenih števil — to ni
 * ugibanje. Kadar površine ne poznamo, ostane cena NEZNANA: raje prazno kot
 * napačno.
 */
export function cenaOglasa(r: SurovaKartica, povrsinaM2: number | null): number | null {
  if (!r.cenaBesedilo) return null;
  const cist = r.cenaBesedilo.replace(/\s*€\s*$/, "").trim();
  // Mikropodatek uporablja decimalno PIKO ("3850000.00"), slovenski zapis pa
  // pike kot tisočice ("3.850.000,00 €"). Branje enega s pravili drugega je
  // naredilo cene ×100 — zato sta poti tu izrecno ločeni.
  const osnovna = /^\d+(?:\.\d{1,2})?$/.test(cist) ? Number(cist) : cenaIz(r.cenaBesedilo);
  if (osnovna === null || !Number.isFinite(osnovna) || osnovna <= 0) return null;

  const naEnoto = /(?:eur|€)\s*\/\s*m2|\/\s*m²/i.test(r.opis ?? "");
  if (!naEnoto) return osnovna;
  if (povrsinaM2 === null || povrsinaM2 <= 0) return null;
  return Math.round(osnovna * povrsinaM2);
}

export function normaliziraj(r: SurovaKartica, rezina: Rezina): NormaliziranOglas {
  const opis = r.opis ?? "";
  const iz = izOpisa(opis);
  // podtip iz naslovne vrstice: "Prodaja: Hiša, Samostojna" -> "samostojna"
  // "Prodaja: Hiša, Samostojna BISTRICA OB DRAVI 208..." — podtip je do prve
  // besede iz samih velikih črk (lokacija) ali do prve številke.
  /**
   * Podtip iz naslovne vrstice: "Prodaja: Hiša, Samostojna BISTRICA OB DRAVI
   * 208…" -> "samostojna". Odrežemo besede iz samih velikih črk (to je kraj)
   * in vse od prve številke naprej.
   *
   * Prej je tu pisalo `split(/s+/)` — vzorec brez leve poševnice, ki ne deli
   * po presledkih, ampak po ČRKI "s". "Samostojna BISTRICA" je zato razpadla
   * na "Samo", "tojna BI", "TRICA" in podtip je bil zmazek. Filter `!/^d/`
   * je bil enak spodrsljaj: mišljeno je bilo "ne začni s številko" (`\d`),
   * dejansko pa je brisal vsako besedo na črko "d".
   */
  const podtipSurov = r.naslovVrstica?.split(",")[1]?.trim() ?? null;
  const podtip = podtipSurov
    ? podtipSurov
        .split(/\s+/)
        .filter((b) => !/^[A-ZČŠŽ]{2,}$/.test(b) && !/^\d/.test(b))
        .join(" ")
        .toLowerCase()
        .trim() || null
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
    cenaEur: cenaOglasa(r, iz.povrsinaM2),
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
    // Vzorec se mora začeti s ŠTEVKO. Prejšnji `[\d.]+` je v "Št. spalnic: 2"
    // pobral piko iz okrajšave "Št." in vrnil 0 — tiho, brez napake, za vsak
    // tak oglas. Zato je prva števka obvezna.
    const m = najdi(re)?.match(/(\d[\d.]*(?:,\d+)?)/);
    return m ? stevilo(m[1]) : null;
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
  // robots.txt tega vira Crawl-delay NE navaja (preverjeno 20.-21. 8. 2026);
  // null pomeni "ni predpisan", ne "nič sekund". Naš razmik je v omejitve.zamikMs.
  crawlDelayS: null,
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
