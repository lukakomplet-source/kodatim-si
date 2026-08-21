import type { Page } from "playwright";
import { cenaIz, izOpisa, stevilo } from "../parse.js";
import type { NormaliziranOglas } from "../db.js";
import type { Detajl, Rezina as BazniRezina, SurovaKartica, VirAdapter } from "./vmesnik.js";

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
      // Bolha med kartice kategorije vrine tudi priporočene oglase iz DRUGIH
      // kategorij. Brez te preverbe so v nepremičninski bazi pristali romani,
      // znamke, harmonike, iPhone in traktorski priključek — vsi zavedeni kot
      // "hiša" s ceno, ki bi popačila vsak izračun €/m². Nepremičninski oglas
      // je vedno pod /nepremicnine/.
      if (!/\/nepremicnine\//.test(url)) continue;
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

/**
 * 2. FAZA — detajlna stran bolhe.
 *
 * Bolha ima za razliko od nepremicnine.net pravo tabelo lastnosti
 * (`dt`/`dd` v `.ClassifiedDetailBasicDetails-list`), zato se prebere kot
 * slovar in šele nato preslika v naša polja. Vsak ključ, ki ga ne poznamo,
 * ostane v `lastnosti` — nov podatek tako ne zahteva nove migracije in se ne
 * izgubi, dokler zanj ne najdemo mesta.
 *
 * Telefona NE odklepamo: skrit je za gumbom in razkrije se šele s klikom.
 * Klik bi bil obhod namerne ovire, poleg tega pa hramba telefonskih številk
 * zasebnikov ni brez posledic po GDPR — zato ostane prazen.
 *
 * Preverjeno na resnični strani (oglas 15780363, 20. 8. 2026).
 */

/** Kar brskalnik vrne — samo besedilo; razčlenitev teče v Node (glej opombo). */
export type SurovDetajlBolha = {
  /** Izmenično ključ, vrednost, ključ, vrednost … iz tabele lastnosti. */
  pari: string[];
  skupine: { naslov: string; postavke: string[] }[];
  cena: string | null;
  sifra: string | null;
  posrednik: string | null;
  opis: string | null;
  slike: string[];
};

export function detajlIzSurovegaBolha(s: SurovDetajlBolha): Detajl {
  const lastnosti: Record<string, string> = {};
  for (let i = 0; i + 1 < s.pari.length; i += 2) {
    const kljuc = s.pari[i].trim();
    if (kljuc) lastnosti[kljuc] = s.pari[i + 1].trim();
  }
  for (const g of s.skupine) {
    if (g.naslov && g.postavke.length > 0) lastnosti[g.naslov] = g.postavke.join(", ");
  }

  /**
   * Iskanje po imenu ključa: najprej TOČNO ujemanje, šele nato delno.
   * Prej je bilo samo delno in "Površina" je ujela "Površina parcele" — pri
   * hiši s 400 m² parcele in 250 m² bivalne površine je v `povrsina_m2`
   * pristalo 400. To ni prazno polje, ampak napačna številka, in €/m² je
   * bil zato tiho napačen.
   */
  const najdi = (...kljuci: string[]): string | null => {
    const imena = Object.keys(lastnosti);
    for (const k of kljuci) {
      const tocno = imena.find((i) => i.toLowerCase() === k.toLowerCase());
      if (tocno) return lastnosti[tocno];
    }
    for (const k of kljuci) {
      const delno = imena.find((i) => i.toLowerCase().includes(k.toLowerCase()));
      if (delno) return lastnosti[delno];
    }
    return null;
  };
  /**
   * Bolha piše števila po angleško ("173.72 m2", pika = decimalka),
   * nepremicnine.net po slovensko ("208,4 m2", pike = tisočice). Slepo
   * brisanje pik je iz 173,72 m² naredilo 17.372 m² — zato skupni `stevilo()`
   * iz parse.ts, ki zapisa loči, in ne lastna različica.
   */
  const stevilka = (...kljuci: string[]): number | null => {
    const m = najdi(...kljuci)?.match(/(\d[\d.]*(?:,\d+)?)/);
    return m ? stevilo(m[1]) : null;
  };
  /**
   * Zastavica iz tabele: prisotnost ključa NI enaka "da". Vir zna zapisati
   * "Klet: Ne" in prej je vsak tak oglas dobil klet — filter bi vrnil preveč
   * zadetkov, ne da bi kdo opazil, ker manjkajoče lastnosti ni videti.
   */
  const zastavica = (...kljuci: string[]): boolean | null => {
    const v = najdi(...kljuci);
    if (v === null) return null;
    return !/^\s*(ne|nima|brez|ni)\s*$/i.test(v);
  };

  const balkonTerasa = najdi("Balkon / terasa", "Balkon") ?? "";
  const cenaStevilo = stevilo((s.cena ?? "").replace(/[^\d.,]/g, ""));
  const slike = [...new Set(s.slike)];

  return {
    // "Površina" ostane zadnja izbira, a šele za točnimi imeni — in nikoli
    // ne sme prevzeti parcele, ki ima svoj ključ.
    povrsinaM2: stevilka("Bivalna površina", "Površina stanovanja", "Površina hiše", "Površina"),
    zemljisceM2: stevilka("Površina parcele", "Velikost parcele"),
    stSob: stevilka("Število sob"),
    stKopalnic: stevilka("Število kopalnic", "Kopalnice"),
    letoIzgradnje: stevilka("Leto izgradnje"),
    letoAdaptacije: stevilka("Leto adaptacije", "Leto prenove"),
    nadstropje: najdi("Nadstropje"),
    etaznost: najdi("Število nadstropij", "Etažnost"),
    energetskiRazred: najdi("Energetska izkaznica", "Energetski razred"),
    ogrevanje: najdi("Ogrevanje"),
    opremljenost: najdi("Opremljenost"),
    stanje: najdi("Stanje nepremičnine", "Stanje"),
    lastnistvo: najdi("Lastništvo"),
    parkirno: najdi("Število parkirnih mest", "Parkirno mesto", "Garaža"),
    balkon: balkonTerasa ? /balkon/i.test(balkonTerasa) : null,
    terasa: balkonTerasa ? /teras/i.test(balkonTerasa) : null,
    vrt: balkonTerasa ? /atrij|vrt/i.test(balkonTerasa) : null,
    klet: zastavica("Klet"),
    dvigalo: zastavica("Dvigalo"),
    sifraOglasa: s.sifra?.replace(/^\s*Šifra oglasa:\s*/i, "").trim() || null,
    kraj: najdi("Lokacija"),
    // Telefon namerno ostane prazen — glej opombo nad preberiDetajl.
    telefon: null,
    posrednik: s.posrednik,
    opis: s.opis || null,
    cenaEur: cenaStevilo !== null && cenaStevilo > 0 ? cenaStevilo : null,
    slikeUrls: slike.length > 0 ? slike : null,
    lastnosti,
  };
}

export async function preberiDetajl(page: Page): Promise<Detajl> {
  const surovo = (await page.evaluate(() => ({
    pari: Array.from(
      document.querySelectorAll(
        ".ClassifiedDetailBasicDetails-listTerm, .ClassifiedDetailBasicDetails-listDefinition"
      )
    ).map((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
    skupine: Array.from(document.querySelectorAll(".ClassifiedDetailPropertyGroups-group")).map((g) => ({
      naslov:
        (g.querySelector(".ClassifiedDetailPropertyGroups-groupTitle") as HTMLElement | null)?.innerText?.trim() ?? "",
      postavke: Array.from(g.querySelectorAll(".ClassifiedDetailPropertyGroups-groupListItem"))
        .map((li) => (li as HTMLElement).innerText.replace(/\s+/g, " ").trim())
        .filter((v) => v.length > 0),
    })),
    cena:
      (document.querySelector(".ClassifiedDetailSummary-priceDomestic") as HTMLElement | null)?.innerText?.trim() ??
      null,
    sifra: (document.querySelector(".ClassifiedDetailSummary-adCode") as HTMLElement | null)?.innerText?.trim() ?? null,
    posrednik:
      (document.querySelector(".ClassifiedDetailOwnerDetails-title") as HTMLElement | null)?.innerText?.trim() ?? null,
    opis:
      (document.querySelector(".ClassifiedDetailDescription-text") as HTMLElement | null)?.innerText?.trim() ?? null,
    slike: Array.from(document.querySelectorAll("img.ClassifiedDetailGallery-slideImage"))
      .map((i) => i.getAttribute("data-src") ?? i.getAttribute("src") ?? "")
      .filter((u) => u.includes("bolha.com/image")),
  }))) as SurovDetajlBolha;
  return detajlIzSurovegaBolha(surovo);
}

export const adapter: VirAdapter = {
  vir: VIR,
  // 15 s. Pot do te številke: 6 s -> mehka blokada po ~25 straneh; 10 s ->
  // nekaj krogov je šlo skozi, nato spet zavrnitve in nazadnje CAPTCHA na
  // detajlnih straneh. Vsaka stopnja je bila odgovor na zavrnitev z
  // ZMANJŠANJEM, nikoli s poskusom drugačnega dostopa.
  omejitve: { zamikMs: 15_000 },
  /**
   * PRORAČUN ZAHTEVKOV ZA CEL KROG — obe fazi skupaj (glej index.ts).
   *
   * Izmerjeno: vir zavrne po ~50–60 zahtevkih v eni seji. Prej je bila kvota
   * 40 STRANI, 2. faza pa je dodala še do 120 detajlnih strani — torej 160
   * obiskov tam, kjer je meja 50. Zdaj je meja ena in je 30: udobno pod
   * izmerjeno mejo, tudi če se ta med dnevi premakne.
   *
   * Posledica je počasnejše polnjenje in to je pošteno povedati, ne skriti:
   * konzola pokaže, koliko dni pri tem tempu traja, da bodo vsi oglasi imeli
   * podrobnosti. Če je to predolgo, je odgovor dogovor z virom — ne hitrejše
   * branje.
   */
  najvecStrani: 30,
  hlajenjeUr: 12,
  /**
   * Ali je seznam razvrščen od najnovejšega, še NI izmerjeno
   * (`npm run test:razvrstitev bolha.com`). Dokler ni, inkrementalnega
   * branja ne vklapljamo: zgodnja ustavitev pri pomešanem seznamu tiho
   * izpusti del trga.
   */
  razvrsceniPoNovosti: false,
  pricakovanRazpon: [300, 40000],
  slikePolitika: "referenca",
  svezKontekstNaStran: true,
  // robots.txt tega vira Crawl-delay NE navaja (preverjeno 20.-21. 8. 2026);
  // null pomeni "ni predpisan", ne "nič sekund". Naš razmik je v omejitve.zamikMs.
  crawlDelayS: null,
  pravno:
    "Pogoji (27. 10. 2025) splošne prepovedi scrapinga NIMAJO; prepovedano je kopiranje vsebine brez pisnega dovoljenja. robots.txt prepoveduje /search in slikovne endpointe — beremo samo kategorijske strani.",
  // Detajli jemljejo iz istega proračuna kot seznami (najvecStrani), zato je
  // ta številka zgornja meja in ne obljuba — kar 1. faza porabi, detajlom
  // ostane manj.
  detajli: { zamikMs: 15_000, kvota: 30, preberi: preberiDetajl },
  rezine: () => KATEGORIJE,
  seznamUrl: (r, stran) => seznamUrl(r as BolhaRezina, stran),
  preberiSeznam,
  normaliziraj: (k, r) => normaliziraj(k, r as BolhaRezina),
};
