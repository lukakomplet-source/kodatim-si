import type { NormaliziranOglas } from "../db.js";
import { cenaIz, izOpisa, nastanitevIz, stevilo } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, goloBesedilo, prenesi } from "./http.js";

/**
 * kwslovenia.com — Keller Williams Slovenia (MARKET CENTER OMNIS d.o.o.).
 *
 * Zakaj ta vir: ~550 agencijskih oglasov, od tega ~10 % na Hrvaškem (Istra,
 * Pag), nekaj poslovnih kompleksov, večstanovanjskih hiš in en hotel (Buje,
 * 4.500 m²). Cene so agentove izklicne — signala "posla" vir nima, zato je
 * prednost srednje nizka; vrednost je v inventarju, ki ga drugi viri nimajo.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt: ena skupina za *, "Allow: /" in "Crawl-delay: 30". Nobene
 *     skupine za AI ali posebne bote, Content-Signal ga ni.
 *   - pogojev uporabe SPLETIŠČA ni. Edina pravna besedila so posredniški
 *     splošni pogoji (razmerje agencija–naročnik), cenik, zavarovalna polica
 *     in pravilnik o osebnih podatkih; o robotih, zajemu ali zbirkah ne pravijo
 *     nič. Na vsaki strani je le noga "Vse pravice pridržane. Copyright Keller
 *     Williams Slovenia."
 *   - POGOJ iz te noge in iz pravice zbirke (ZASP 141.a): hranimo SAMO DEJSTVA
 *     (posel, vrsta, cena, m², kraj, leto) s povezavo nazaj na oglas. Opisov
 *     ne shranjujemo — tudi odlomka na kartici ne; iz njega vzamemo le
 *     številke in oznake (leto, število enot, "hotel"). Fotografij (bunny.100m2.si)
 *     ne kopiramo in nanje ne kažemo. Imen agentov (osebni podatki) ne beremo.
 *   - Turnstile je na strani SAMO v kontaktnih obrazcih; teh ne pošiljamo in
 *     notranjih ajax klicev (get_city ipd.) ne kličemo.
 *
 * ZAKAJ SEZNAM IN NE SITEMAP. Presoja je predlagala sitemap + detajlne strani
 * samo za nove ID-je. Sitemap pa pove le ID in slug (posel, vrsta, regija,
 * kraj) — brez cene in brez m²; poleg tega vse vnose piše na tuj gostitelj
 * (www.kapitol.si, kjer vračajo 404). Detajlne strani bi potrebovale 2. fazo,
 * ta pa je v našem zbiralniku samo z brskalnikom. Kartica na seznamu ima vsa
 * dejstva, ki jih potrebujemo, in en zahtevek prinese devet oglasov — 61 strani
 * namesto 547 detajlov, torej devetkrat manj obiskov pri istem Crawl-delay.
 *
 * RAZVRSTITEV (izmerjeno 29. 9. 2026, strani 1, 2 in 61): privzeta prva stran
 * je enaka "Novejši naprej" (?sort=activate_dt-desc, ponudba v meniju vira);
 * stran 1 nosi najvišje ID-je (543677 …), zadnja najnižje (406722 …), vmes
 * pa stari ID-ji (500579 na prvi strani). Vrstni red NI strog: oglas 543398
 * je bil deveti na strani 1 in hkrati tretji na strani 2, čeprav se prva stran
 * vmes ni spremenila (enaka devetka tudi tri minute pozneje, 547 oglasov).
 * Vir torej izenačene oglase med stranmi premeša — polni obhod kakšnega vidi
 * dvakrat in kakšnega izpusti. Zato ga beremo vsaka dva dni znova;
 * dvo-udarčno pravilo izginotja zdrži en izpust. Datum na kartici NI ključ
 * razvrstitve (ni monoton) — hranimo ga v raw kot "datum na kartici".
 */

const VIR = "kwslovenia.com";
// Samo goli gostitelj: www.kwslovenia.com preusmeri na http, www.kapitol.si je drugo spletišče.
const OSNOVA = "https://kwslovenia.com";

/** Strukturirana dejstva ene kartice — to gre v raw. Brez besedila opisa, brez agenta, brez slik. */
type Kartica = {
  id: string;
  slug: string;
  posel: string | null;
  vrsta: string | null;
  podtip: string | null;
  /** "Pomurska, Gornja Radgona, Gornja Radgona" (regija, občina, naselje) ali "Hrvaška, Istarska županija, Buje". */
  lokacija: string[];
  cena: string | null;
  velikostM2: number | null;
  zemljisceM2: number | null;
  datumNaKartici: string | null;
  /** Številke in oznake iz odlomka opisa. Besedilo samo se zavrže. */
  izBesedila: {
    letoIzgradnje: number | null;
    letoAdaptacije: number | null;
    nadstropje: string | null;
    stEnot: number | null;
    stEnotOcena: number | null;
    vecEnot: boolean;
    zaObnovo: boolean;
    zaInvesticijo: boolean;
    nastanitev: string | null;
    sob: number | null;
    apartmajev: number | null;
    enot: number | null;
    lezisc: number | null;
  };
};

/**
 * Ena rezina: cel katalog, "Novejši naprej". Filtri po vrsti in regiji imajo
 * v poti nepregleden žeton (/oglasi/poslovni-prostor/savinjska/<žeton>), ki ga
 * ne bomo ugibali; 61 strani je za eno rezino povsem obvladljivo.
 */
const REZINE: Rezina[] = [{ oznaka: "vsi-novejsi-naprej" }];

function seznamUrl(_r: Rezina, stran: number): string {
  // Oblika je prepisana s povezav paginacije vira ("?sort=activate_dt-desc&page=2").
  const osnova = `${OSNOVA}/oglasi?sort=activate_dt-desc`;
  return stran <= 1 ? osnova : `${osnova}&page=${stran}`;
}

async function preberiHttp(
  r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  return karticeIzHtml(await prenesi(seznamUrl(r, stran), ua), stran);
}

/**
 * Ikoni ob m² ločita površino od zemljišča — besedila ob številki ni. Ključ
 * je id clipPath v vgrajenem SVG (enak na vseh karticah, izmerjeno na 25
 * karticah treh strani). Če ga vir zamenja, velja vrstni red: prva številka
 * je površina, druga zemljišče (tako je bilo na vseh 25).
 */
const IKONA_POVRSINA = "clip0_61_8689";
const IKONA_ZEMLJISCE = "clip0_384_5881";

const stevec = (s: string | undefined): number | null => {
  const n = stevilo(s);
  return n !== null && n > 0 ? n : null;
};

/** Čisto razčlenjevanje strani — brez omrežja, zato ga je mogoče preizkusiti na shranjeni strani. */
export function karticeIzHtml(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();

  for (const blok of html.split(/<div class="pzl-item\b/).slice(1)) {
    // Podatkovni del kartice je ena povezava: <a href=".../oglas/<id>-<slug>" class="... data">…</a>.
    const podatki = blok.match(
      /<a href="https:\/\/kwslovenia\.com\/oglas\/(\d+)-([a-z0-9-]+)"\s+class="[^"]*\bdata\b[^"]*">([\s\S]*?)<\/a>/
    );
    if (!podatki) continue;
    const [, id, slug, notranjost] = podatki;
    if (videni.has(id)) continue;

    // "Nepremičnina: Prodaja, Hiša, Samostojna" — posel, vrsta, podtip.
    const opredelitev = brezEntitet(blok.match(/title="Nepremičnina:\s*([^"]*)"/)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const posel = goloBesedilo(notranjost.match(/class="tag offer-type">([\s\S]*?)<\/span>/)?.[1] ?? "") || opredelitev[0] || null;
    // Povpraševanja ("Nakup", "Najem") niso ponudba nepremičnine.
    if (!posel || !/prodaja|oddaja/i.test(posel)) continue;
    videni.add(id);

    // "Lokacija: Pomurska, Gornja Radgona, Gornja Radgona" — naselje je samo tu, naslov h2 ga nima.
    const lokacija = (
      brezEntitet(blok.match(/alt="Lokacija:\s*([^"]*)"/)?.[1] ?? "") ||
      goloBesedilo(notranjost.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "")
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Površine: vsak <span> z ikono in "N m<sup>2</sup>".
    let velikostM2: number | null = null;
    let zemljisceM2: number | null = null;
    const brezIkone: number[] = [];
    for (const m of notranjost.matchAll(/<span>([\s\S]*?)<\/span>/g)) {
      const vsebina = m[1];
      const n = stevec(vsebina.replace(/<svg[\s\S]*?<\/svg>/g, "").match(/([\d.,]+)\s*m\s*<sup>\s*2/)?.[1]);
      if (n === null) continue;
      if (vsebina.includes(IKONA_POVRSINA)) velikostM2 = n;
      else if (vsebina.includes(IKONA_ZEMLJISCE)) zemljisceM2 = n;
      else brezIkone.push(n);
    }
    if (velikostM2 === null && brezIkone.length > 0) velikostM2 = brezIkone.shift() ?? null;
    if (zemljisceM2 === null && brezIkone.length > 0) zemljisceM2 = brezIkone.shift() ?? null;

    const cena = goloBesedilo(notranjost.match(/class="price">([\s\S]*?)<\/span>/)?.[1] ?? "") || null;
    const datum = notranjost.match(/(\d{2})\.(\d{2})\.(\d{4})/);

    // ODLOMEK OPISA: samo za številke in oznake, NIKOLI v bazo (glej pravno).
    const odlomek = goloBesedilo(notranjost.match(/class="description">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const podtip = opredelitev[2] ?? null;
    const vrsta = opredelitev[1] ?? null;
    const tip = tipIz(vrsta, podtip);
    // Podtip je trditev vira ("Hotel", "Dvostanovanjska") — pred odlomkom, da ga oba detektorja vidita na začetku.
    const zaZaznavo = [podtip, odlomek].filter(Boolean).join(", ");
    const iz = izOpisa(zaZaznavo);
    const n = nastanitevIz(zaZaznavo, tip);

    const k: Kartica = {
      id,
      slug,
      posel,
      vrsta,
      podtip,
      lokacija,
      cena,
      velikostM2,
      zemljisceM2,
      datumNaKartici: datum ? `${datum[3]}-${datum[2]}-${datum[1]}` : null,
      izBesedila: {
        letoIzgradnje: iz.letoIzgradnje,
        letoAdaptacije: iz.letoAdaptacije,
        nadstropje: iz.nadstropje,
        stEnot: iz.stEnot,
        stEnotOcena: iz.stEnotOcena,
        vecEnot: iz.vecEnot,
        zaObnovo: iz.zaObnovo,
        zaInvesticijo: iz.zaInvesticijo,
        nastanitev: n.vrsta,
        sob: n.sob,
        apartmajev: n.apartmajev,
        enot: n.enot,
        lezisc: n.lezisc,
      },
    };

    // Število fotografij je dejstvo o oglasu; fotografije same niso naše.
    const kontrole = blok.match(/<div class="gallery-controls"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    const stSlik = kontrole ? (kontrole.match(/<a\b/g) ?? []).length || null : blok.includes("pzl-gallery-item") ? 1 : null;

    kartice.push({
      url: `${OSNOVA}/oglas/${id}-${slug}`,
      virId: id,
      lokacija: lokacija.join(", ") || null,
      naslovVrstica: naslovIz(k),
      opis: opisIz(k),
      cenaBesedilo: cena,
      telefon: null,
      agencija: "KW Slovenia (Market Center Omnis d.o.o.)",
      slika: null, // bunny.100m2.si — "Vse pravice pridržane", glej opombo zgoraj
      stSlik,
      surovo: k as unknown as Record<string, unknown>,
    });
  }

  // Oštevilčenje: "zadnja >>" in sosednje strani nosijo ?sort=…&page=N.
  const strani = [...html.matchAll(/\/oglasi\?[^"'\s>]*?page=(\d+)/g)].map((m) => Number(m[1]));
  const zadnjaStran = strani.length > 0 ? Math.max(stran, ...strani) : kartice.length > 0 ? stran : null;
  // "<strong>547</strong> oglasov" — vir sam pove, koliko jih ima (tudi "0 oglasov").
  const skupaj = html.match(/<strong>\s*([\d.]+)\s*<\/strong>\s*oglas/)?.[1];
  const skupajZadetkov = skupaj !== undefined ? stevilo(skupaj) : null;
  return { kartice, zadnjaStran, skupajZadetkov };
}

/** Vrsta vira -> naš tip. Podtip odloči samo tam, kjer vir vikend ali garažo skrije pod drugo vrsto. */
function tipIz(vrsta: string | null, podtip: string | null): string | null {
  const v = (vrsta ?? "").toLowerCase();
  const p = (podtip ?? "").toLowerCase();
  if (/vikend/.test(v) || /vikend/.test(p)) return "vikend";
  if (/garaž|garaz|parkir/.test(v) || /garaž|garaz|parkirn/.test(p)) return "garaza";
  if (/počitni|pocitni/.test(v)) return "pocitniski_objekt";
  if (/^hiš|^his/.test(v)) return "hisa";
  if (/^stanovanj/.test(v)) return "stanovanje";
  if (/^parcel|zemljiš|zemljis|posest/.test(v)) return "posest";
  if (/^poslovn/.test(v)) return "poslovni_prostor";
  return null;
}

const SLO_REGIJE: Record<string, string> = {
  pomurska: "pomurska",
  podravska: "podravska",
  koroska: "koroska",
  savinjska: "savinjska",
  zasavska: "zasavska",
  posavska: "posavska",
  spodnjeposavska: "posavska",
  dolenjska: "dolenjska",
  "jugovzhodna-slovenija": "dolenjska",
  "ljubljana-mesto": "ljubljana-mesto",
  "ljubljana-okolica": "ljubljana-okolica",
  gorenjska: "gorenjska",
  goriska: "goriska",
  "obalno-kraska": "obalno-kraska",
  notranjska: "notranjska",
  // Vir piše "Notranjsko - kraška" (stari ime statistične regije).
  "notranjsko-kraska": "notranjska",
  "primorsko-notranjska": "notranjska",
};

const slugIz = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Slovenska statistična regija ali null (Hrvaška, Italija … niso naše regije). */
function regijaIz(lokacija: string[]): string | null {
  return lokacija[0] ? SLO_REGIJE[slugIz(lokacija[0])] ?? null : null;
}

/**
 * Naselje. Pri slovenskih je lokacija "regija, občina, naselje"; "Center" ni
 * naselje, ampak mestni predel (Koper, Maribor), zato takrat velja občina.
 * Ljubljana mesto ima namesto občine četrt (Šiška, Bežigrad) — naselje je
 * Ljubljana, četrt ostane v naslovu. Pri tujih je zadnji del kraj.
 */
function krajIz(lokacija: string[]): string | null {
  const regija = regijaIz(lokacija);
  if (regija === "ljubljana-mesto") return "Ljubljana";
  if (regija) {
    const [, obcina, naselje] = lokacija;
    if (naselje && !/^(center|centar|mesto)$/i.test(naselje)) return naselje;
    return obcina ?? null;
  }
  return lokacija.length >= 2 ? lokacija[lokacija.length - 1] : null;
}

const m2 = (n: number): string => `${String(n).replace(".", ",")} m2`;

/** Naslov iz dejstev, v obliki, ki jo vir sam uporablja v <title> detajla. */
function naslovIz(k: Kartica): string {
  const povrsina = k.velikostM2 ?? k.zemljisceM2;
  // "Pomurska, Gornja Radgona, Gornja Radgona" -> brez ponovitve; "Center" ni kraj.
  const kraji = k.lokacija.filter((d, i) => d !== k.lokacija[i - 1] && !/^(center|centar)$/i.test(d));
  return [k.posel, k.vrsta, k.podtip, ...kraji, povrsina !== null ? m2(povrsina) : null]
    .filter(Boolean)
    .join(", ");
}

const NASTANITEV_BESEDA: Record<string, string> = {
  hotel: "hotel",
  penzion: "penzion",
  hostel: "hostel",
  motel: "motel",
  apartmajska_hisa: "apartmajska hiša",
  turisticna_kmetija: "turistična kmetija",
  gostisce: "gostišče",
  nastanitveni_objekt: "nastanitveni objekt",
};

/**
 * "Opis" iz samih dejstev. Nastanitev in njene številke gredo NA ZAČETEK, ker
 * osrednji detektor (nastanitevIz v db.ts) pri hiši in parceli upošteva samo
 * prvih 150 znakov naslova in opisa — tam pove oglas, kaj prodaja.
 */
function opisIz(k: Kartica): string {
  const b = k.izBesedila;
  const deli: (string | null)[] = [];
  if (b.nastanitev) {
    deli.push(NASTANITEV_BESEDA[b.nastanitev] ?? b.nastanitev);
    if (b.sob) deli.push(`${b.sob} sob`);
    if (b.apartmajev) deli.push(`${b.apartmajev} apartmajev`);
    if (b.enot && b.enot !== b.sob && b.enot !== b.apartmajev) deli.push(`${b.enot} enot`);
    if (b.lezisc) deli.push(`${b.lezisc} ležišč`);
  }
  deli.push(
    [k.vrsta, k.podtip].filter(Boolean).join(", ").toLowerCase() || null,
    k.velikostM2 !== null && tipIz(k.vrsta, k.podtip) !== "posest" ? m2(k.velikostM2) : null,
    k.zemljisceM2 !== null ? `${m2(k.zemljisceM2)} zemljišča` : null,
    b.letoIzgradnje ? `zgrajena l. ${b.letoIzgradnje}` : null,
    b.letoAdaptacije ? `adaptirana l. ${b.letoAdaptacije}` : null,
    b.nadstropje,
    // Oblika, ki jo izOpisa prebere enako: trditev "z N enotami", možnost "možnost N enot".
    !b.nastanitev && b.stEnot ? `z ${b.stEnot} enotami` : null,
    b.stEnotOcena ? `možnost ${b.stEnotOcena} enot` : null,
    b.zaObnovo ? "za obnovo" : null
  );
  return deli.filter(Boolean).join(", ");
}

/**
 * Cena samo, kadar je to CELOTNA cena (ali mesečna najemnina pri oddaji).
 * "10 €/m2/mesec" je cena na kvadratni meter, "po dogovoru" ni cena, 9.999.999
 * je nadomestek — vse to je null, surovo besedilo ostane v raw.
 */
function cenaEurIz(besedilo: string | null, posel: string): number | null {
  if (!besedilo) return null;
  const t = besedilo.toLowerCase();
  if (/dogovor|zahtev|pokli|informacij/.test(t)) return null;
  if (/\/\s*m\s*2|\/\s*m²|na\s+m2/.test(t)) return null;
  // Pri oddaji je sprejemljiva samo mesečna najemnina (ali brez obdobja).
  if (posel === "oddaja" && /\/\s*(?:leto|dan|teden|noč|noc)/.test(t)) return null;
  const n = cenaIz(besedilo);
  if (n === null) return null;
  if (/^9{5,}$/.test(String(Math.round(n))) || n <= 1) return null;
  return n;
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const s = (k.surovo ?? {}) as unknown as Kartica;
  const b = s.izBesedila ?? ({} as Kartica["izBesedila"]);
  const posel = /oddaja/i.test(s.posel ?? "") ? "oddaja" : "prodaja";
  const tip = tipIz(s.vrsta ?? null, s.podtip ?? null);
  const lokacija = s.lokacija ?? [];
  const podtip = s.podtip ? s.podtip.toLowerCase() : null;
  // Enote samo, ko jih vir TRDI ("z dvema ločenima enotama", podtip
  // "Dvostanovanjska"); sobe hiše niso enote. Sobe hotela doda osrednji
  // detektor iz opisa ("hotel, 36 sob").
  const stEnot = b.stEnot ?? null;
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip,
    podtip,
    posel,
    regija: regijaIz(lokacija),
    kraj: krajIz(lokacija),
    cenaEur: cenaEurIz(s.cena ?? k.cenaBesedilo, posel),
    povrsinaM2: tip === "posest" ? null : s.velikostM2 ?? null,
    zemljisceM2: s.zemljisceM2 ?? (tip === "posest" ? s.velikostM2 ?? null : null),
    letoIzgradnje: b.letoIzgradnje ?? null,
    letoAdaptacije: b.letoAdaptacije ?? null,
    nadstropje: b.nadstropje ?? null,
    vecEnot: Boolean(b.vecEnot) || (stEnot !== null && stEnot >= 2),
    stEnot,
    stEnotOcena: b.stEnotOcena ?? null,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: Boolean(b.zaObnovo),
    zaInvesticijo: Boolean(b.zaInvesticijo) || podtip === "hotel",
    opis: k.opis,
    // Agent je fizična oseba — osebni podatek, ki ga ne hranimo.
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    slikaUrl: null,
    stSlik: k.stSlik,
    raw: { kartica: s, rezina: r.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  // robots.txt: Crawl-delay 30. Pet sekund rezerve, da ga tresenje ure in omrežja nikoli ne podkorači.
  omejitve: { zamikMs: 35_000 },
  crawlDelayS: 30,
  pricakovanRazpon: [30, 2_000],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  /**
   * 61 strani po 9 oglasov (547 oglasov, 29. 9. 2026). 30 obiskov na dan —
   * 17 minut enakomernega branja — sklene polni obhod v dobrih dveh dneh.
   * Presoja je svetovala čim manjšo obremenitev (vir je majhna agencija, ne
   * portal), zato ne beremo celega kataloga vsak dan.
   */
  najvecStrani: 30,
  // Varovalka proti napačno prebranemu številu strani; 80 strani = 720 oglasov, kar je z rezervo nad trgom vira.
  najvecStraniNaRezino: 80,
  dnevnaMejaStrani: 30,
  dnevniProracunVira: 36,
  // NI dokazano (glej opombo RAZVRSTITEV): najnovejši so sicer večinoma na
  // vrhu, a ne ID-ji ne datumi na kartici niso monotoni, privzeta stran pa je
  // enaka "Novejši naprej" — ali vir parameter sploh upošteva, ne vemo. Nov
  // oglas zato pride v bazo, ko obhod pride do prve strani (najpozneje v ~2 dneh).
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (29. 9. 2026): ena skupina za *, Allow: / in Crawl-delay: 30 — beremo samo seznam " +
    "/oglasi?sort=activate_dt-desc&page=N, en zahtevek na 35 s; kontaktnih obrazcev (Turnstile) in notranjih " +
    "ajax klicev ne kličemo. Pogojev uporabe spletišča ni: edina pravna besedila so posredniški splošni pogoji " +
    "MARKET CENTER OMNIS d.o.o. (razmerje agencija–naročnik), ki o robotih, zajemu ali zbirkah ne govorijo, in " +
    "noga »Vse pravice pridržane«. Presoja in dva neodvisna skeptika (pravni + tehnični) omejitve niso našli. " +
    "POGOJ: hranimo samo dejstva (posel, vrsta, cena, m², kraj, leto) s povezavo na oglas — opisov, fotografij " +
    "(bunny.100m2.si) in imen agentov ne shranjujemo in podatkov ne objavljamo kot konkurenčni portal.",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("kwslovenia.com se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
