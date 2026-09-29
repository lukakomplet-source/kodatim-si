import type { NormaliziranOglas } from "../db.js";
import { izOpisa, nastanitevIz, stevilo, type IzOpisa, type Nastanitev } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, goloBesedilo, prenesi } from "./http.js";

/**
 * acasa.si — ACASA GROUP g.i.z., agencijska skupina s slovenske obale
 * (Portorož, Piran, Izola, Koper) z nekaj oglasi v Trstu in hrvaški Istri.
 *
 * Zakaj ta vir: majhen (29. 9. 2026: 34 oglasov na strani, od tega 27 z
 * oznako kraja) in brez hotelov, a lastna ponudba agencije z obale — dodatek
 * k portalom za Piran/Portorož/Izolo/Koper, ne glavni vir.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt: ena skupina za * s PRAZNIM Disallow, brez Crawl-delay in
 *     brez Content-Signal. Dovoljeno je vse.
 *   - edini "pogoji" so posredniški Splošni pogoji poslovanja (7. 10. 2024)
 *     za naročitelje po ZNPosr; o rabi spletišča, robotih ali zbirkah ne
 *     govorijo. V nogi je samo "Copyright © 2024 ACASA GROUP g.i.z.".
 *   - POGOJ (zaradi avtorske pravice na besedilih in fotografijah ter možne
 *     pravice na zbirki): hranimo SAMO DEJSTVA — ceno, m², kraj, status in
 *     povezavo. Opisa agencije NE shranimo (ne v opis ne v raw); iz njega
 *     razberemo le dejstva (leto gradnje, število enot, "za investicijo").
 *     Slik ne kopiramo in ne povezujemo — slika_url ostane prazen.
 *
 * ZAKAJ NASLOVNICA IN NE SITEMAP ALI DETAJLI:
 *   - wdk-listing-sitemap.xml navaja tudi deaktivirane oglase, njihov lastmod
 *     pa se ob deaktivaciji NE spremeni (izmeril skeptik: oglas s "Listing
 *     missing or not activated" ima lastmod od včeraj). Sitemap zato ne pove,
 *     kaj je na trgu.
 *   - Vsak obisk detajla agenciji poveča števec ogledov (piškotek
 *     tpg_post_views). Kartica ima vse, kar potrebujemo, zato 2. faze ni.
 *   - Naslovnica izriše CEL katalog v enem zahtevku (34 kartic = "34 Listings"
 *     na /grid-map/), /grid-map/ pa po 6 na stran — šest zahtevkov namesto
 *     enega. Gostitelj je majhen deljen LiteSpeed in je skeptiku po štirih
 *     sekundah razmika vrnil prazen odgovor; en zahtevek na dan je prava mera.
 *
 * Tveganje naslovnice je, da ima gradnik omejitev števila kartic brez
 * paginacije — katalog bi nad njo tiho izgubil rep. Zato ga preverimo z
 * gradnikom "Lokacijah" na ISTI strani: ta pove, koliko oglasov ima vsaka
 * lokacija ("Trst 11 Listings"), in 29. 9. se je ujemal s karticami do
 * zadnje. Če kartic neke lokacije ni toliko, kolikor jih gradnik šteje, je
 * seznam okrnjen — in to javimo glasno, namesto da bi oglase razglasili za
 * izginule.
 */

const VIR = "acasa.si";
const OSNOVA = "https://acasa.si";
const AGENCIJA = "ACASA GROUP g.i.z. (acasa.si)";

const REZINE: Rezina[] = [{ oznaka: "ponudba" }];

/**
 * Stran 1 je naslovnica. Poznejših strani danes ni; če bi gradnik nekoč dobil
 * paginacijo, ima WP Directory Kit obliko ?wmvc_paged=N (tako jo piše na
 * /grid-map/), preberiHttp pa preveri, da stran res kaže na ta naslov.
 */
function seznamUrl(_r: Rezina, stran: number): string {
  return stran <= 1 ? `${OSNOVA}/` : `${OSNOVA}/?wmvc_paged=${stran}`;
}

/**
 * Prodano in V mirovanju NISTA na trgu. Ne vrnemo ju: oglas, ki ga popoln
 * pregled ne vidi, zbiralnik po dveh krogih označi kot izginil — natanko to,
 * kar prodaja pomeni. Če se oglas iz mirovanja vrne, ga baza sprejme nazaj
 * ("oglas se je vrnil"). Rezervirano ostane: kupčija še ni sklenjena in se
 * pogosto razdre; status gre v opis.
 */
const NI_NA_TRGU = /^(?:prodano|v mirovanju)$/i;

type Drzava = "SI" | "IT" | "HR";

/** Surova kartica — samo dejstva; opis agencije namenoma manjka (glej zgoraj). */
type KarticaAcasa = {
  id: string;
  slug: string;
  status: string | null;
  lokacije: string[];
  naslov: string;
  cena: string | null;
  lastnosti: Record<string, string>;
  velikostM2: number | null;
  spalnic: number | null;
  kopalnic: number | null;
  drzava: Drzava;
  tip: string | null;
  podtip: string | null;
  kraj: string | null;
  regija: string | null;
  /** Dejstva, razbrana iz naslova in kratkega opisa — brez besedila samega. */
  izOpisa: IzOpisa;
  nastanitev: Nastanitev;
};

// ————————————————————————————————————————————————————————————————
// Lokacija
// ————————————————————————————————————————————————————————————————

/** Občine Obalno-kraške regije — oznaka "Občina Piran" regijo določa brez ugibanja. */
const OBALNO_KRASKE = new Set(["ankaran", "divača", "divaca", "hrpelje-kozina", "izola", "komen", "koper", "piran", "sežana", "sezana"]);

/** Tuje oznake lokacij, kakor jih vir piše v gradniku "Lokacijah". */
const TUJE_OZNAKE: Record<string, Drzava> = { trst: "IT", istra: "HR", kvarner: "HR" };

/**
 * Obalna naselja v naslovu. Naslov pove kraj natančneje od oznake ("1,5 sobno
 * stanovanje v Luciji" ima oznako "Občina Piran"), a v sklonu — zato debla.
 * Seznam je namenoma kratek: samo naselja teh štirih občin, ki jih agencija
 * dejansko prodaja. Vsa so v Obalno-kraški regiji.
 */
const OBALNA_NASELJA: [string, RegExp][] = [
  ["Lucija", /\blucij/i],
  ["Portorož", /\bportoro[žz]/i],
  ["Piran", /\bpiran/i],
  ["Izola", /\bizol[aeiou]?\b/i],
  ["Koper", /\bkop(?:er|ra|ru|rom)\b/i],
  ["Ankaran", /\bankaran/i],
  ["Strunjan", /\bstrunjan/i],
  ["Sečovlje", /\bse[čc]ovlj/i],
  ["Plavje", /\bplavj/i],
  // \b v JS ne pozna šumnikov: pred "Š" meje ni, zato gledamo nazaj.
  ["Šmarje", /(?<![a-zčšž])[šs]marj/i],
  ["Malija", /\bmalij/i],
  ["Krkavče", /\bkrkav[čc]/i],
  ["Hrvatini", /\bhrvatin/i],
  ["Dekani", /\bdekan/i],
  ["Bertoki", /\bbertok/i],
  ["Škofije", /(?<![a-zčšž])[šs]kofij/i],
  ["Marezige", /\bmarezig/i],
  ["Jagodje", /\bjagodj/i],
];

/**
 * Tujina v naslovu ali slugu, kadar kartica oznake lokacije nima ("Stanovanje
 * v TRSTU", "Hiša- dvojček (bližina UMAGA)" s slugom "...-bujeistra-hr-2").
 * "Slovenska Istra" ni tujina, "istrska hiša" pa ni Istra.
 */
const TUJINA: [Drzava, RegExp][] = [
  ["IT", /\btrst\w*|\btrieste|\bmilj[ae]\s*\(?\s*it\b|\bsesljan|\bsistiana|\bportopiccolo|\bitalij/i],
  ["HR", /(?<!slovensk[a-zčšž]*\s+)\bistr[ae]\b|\bumag\w*|\bbuj[ae]\b|\bkvarner|\bhrva[šs]k/i],
];
const TUJI_KRAJI: [string, RegExp][] = [
  ["Trst", /\btrst\w*|\btrieste/i],
  ["Umag", /\bumag/i],
  ["Buje", /\bbuj[ae]\b/i],
];

/** Kraj, ki se v besedilu pojavi NAJPREJ — "hiša v Šmarjah-KOPER" je Šmarje. */
function prviKraj(besedilo: string, seznam: [string, RegExp][]): string | null {
  let najboljsi: { ime: string; kje: number } | null = null;
  for (const [ime, re] of seznam) {
    const m = besedilo.match(re);
    if (m && m.index !== undefined && (najboljsi === null || m.index < najboljsi.kje)) najboljsi = { ime, kje: m.index };
  }
  return najboljsi?.ime ?? null;
}

function lokacija(
  lokacije: string[],
  naslov: string,
  slug: string
): { drzava: Drzava; kraj: string | null; regija: string | null } {
  const oznaka = lokacije[0] ?? null;
  const tujaOznaka = oznaka ? TUJE_OZNAKE[oznaka.toLowerCase()] : undefined;
  let drzava: Drzava = "SI";
  if (tujaOznaka) drzava = tujaOznaka;
  else if (!oznaka) {
    const slugBesede = slug.replace(/-/g, " ");
    for (const [d, re] of TUJINA) {
      if (re.test(naslov) || re.test(slugBesede) || new RegExp(`(?:^|-)${d.toLowerCase()}(?:-|$)`).test(slug)) {
        drzava = d;
        break;
      }
    }
  }

  if (drzava !== "SI") {
    // Tuj kraj: raje oznaka vira ("Trst") kot naselje iz naslova — "Milje"
    // je tudi vas pri Šenčurju in geokodiranje bi Porto San Rocco postavilo
    // na Gorenjsko. Regija ostane prazna: ni slovenska statistična regija.
    const kraj = oznaka ?? prviKraj(naslov, TUJI_KRAJI) ?? (drzava === "IT" ? "Trst" : "Istra");
    return { drzava, kraj, regija: null };
  }

  const obcina = oznaka?.replace(/^občina\s+/i, "").trim() || null;
  const naselje = prviKraj(naslov, OBALNA_NASELJA);
  const regija =
    naselje !== null || (obcina !== null && OBALNO_KRASKE.has(obcina.toLowerCase())) ? "obalno-kraska" : null;
  // "Ostala Slovenija" ni kraj.
  const kraj = naselje ?? (obcina && !/^ostala/i.test(obcina) ? obcina : null);
  return { drzava, kraj, regija };
}

// ————————————————————————————————————————————————————————————————
// Vrsta nepremičnine
// ————————————————————————————————————————————————————————————————

/**
 * Kartica vrste nima (kategorije iskalnik nalaga z AJAX-om), zato jo razberemo
 * iz naslova — zmaga beseda, ki stoji NAJPREJ: "900 m² zazidljivega zemljišča
 * z istrsko hišo" je zemljišče, "hiša s 5+ apartmaji" je hiša. Šele če naslov
 * ne pove nič ("TRST, San Giacomo, 71 m2"), pogledamo v kratek opis.
 * "stanovanjsk" ni stanovanje: "dvostanovanjska hiša" je hiša.
 */
const VRSTE: [string, RegExp][] = [
  ["stanovanje", /stanovanj(?!sk)|garsonjer|\bapartma(?!jsk)|\d\s*-?\s*sobn/i],
  ["hisa", /\bhi[šs]|\bvil[aeoi]?\b|dvoj[čc]ek/i],
  ["posest", /zemlji[šs][čc]|parcel|olj[čc]nik|vinograd/i],
  ["poslovni_prostor", /\blokal|poslovn|pisarn|gostinsk|\bhotel|penzion|trgovin|skladi[šs][čc]/i],
  ["garaza", /gara[žz]|parkirn/i],
  ["vikend", /\bvikend/i],
  ["pocitniski_objekt", /po[čc]itni[šs]k/i],
];

function vrsta(besedilo: string): string | null {
  let najboljsi: { tip: string; kje: number } | null = null;
  for (const [tip, re] of VRSTE) {
    const m = besedilo.match(re);
    if (m && m.index !== undefined && (najboljsi === null || m.index < najboljsi.kje)) najboljsi = { tip, kje: m.index };
  }
  return najboljsi?.tip ?? null;
}

function podvrsta(tip: string | null, naslov: string): string | null {
  const t = naslov.toLowerCase();
  if (tip === "stanovanje") {
    const sob = t.match(/(\d(?:[,.]5)?)\s*-?\s*sobn/);
    if (sob) return `${sob[1].replace(".", ",")}-sobno`;
    if (/garsonjer/.test(t)) return "garsonjera";
    return null;
  }
  if (tip === "hisa") {
    if (/dvoj[čc]ek/.test(t)) return "dvojček";
    if (/samostojn/.test(t)) return "samostojna";
    if (/\bvil/.test(t)) return "vila";
    return null;
  }
  if (tip === "posest") {
    if (/zazidljiv|gradben/.test(t)) return "zazidljivo";
    if (/kmetijsk|olj[čc]nik|vinograd/.test(t)) return "kmetijsko";
    return null;
  }
  if (tip === "poslovni_prostor" && /gostinsk/.test(t)) return "gostinski lokal";
  return null;
}

// ————————————————————————————————————————————————————————————————
// Razčlenjevanje strani
// ————————————————————————————————————————————————————————————————

/**
 * Blok z rezultati: od `wdk-inner-listings-results` do naslednjega gradnika
 * Elementorja. Tako na /grid-map/ ne poberemo stranskega "Featured
 * Properties" (ena kartica s prve strani še enkrat), na naslovnici pa ne
 * "Najbolj ogledanih".
 */
function blokRezultatov(html: string): string | null {
  return blokGradnika(html, /class="[^"]*\bwdk-inner-listings-results\b/);
}

/**
 * Notranji element gradnika do začetka naslednjega gradnika. Iščemo po
 * atributu class ELEMENTA — ime gradnika stoji tudi v ovojnici
 * ("elementor-widget-wdk-…") tik PRED data-widget_type in v povezavah na CSS,
 * zato bi golo iskanje imena odrezalo prazen kos.
 */
function blokGradnika(html: string, zacetekRe: RegExp): string | null {
  const zacetek = html.search(zacetekRe);
  if (zacetek < 0) return null;
  const konec = html.indexOf("data-widget_type=", zacetek);
  return html.slice(zacetek, konec < 0 ? undefined : konec);
}

const polje = (kos: string, re: RegExp): string | null => {
  const m = kos.match(re);
  if (!m) return null;
  const t = goloBesedilo(m[1]);
  return t === "" ? null : t;
};

/** "39.7" (vir piše decimalko s piko) ali "4938" -> število; prazno -> null. */
const m2 = (v: string | undefined): number | null => {
  const n = stevilo(v?.replace(/\s/g, ""));
  return n !== null && n > 0 ? n : null;
};

/**
 * "€ 298.000" -> "298000". Vir piše € SPREDAJ, zato cenaIz() (ki išče
 * "298.000 €") tu ne pomaga. Brez številke ("po dogovoru", prazno) ali z
 * nadomestkom (9.999.999, 1 €) ni cene.
 */
function cenaBesedilo(surova: string | null): string | null {
  if (!surova) return null;
  const m = surova.match(/(\d[\d.\s]*(?:,\d{1,2})?)/);
  if (!m) return null;
  const n = stevilo(m[1].replace(/\s/g, ""));
  if (n === null || n <= 1 || /^9{5,}$/.test(String(Math.round(n)))) return null;
  return String(n);
}

/** Oznaka vrste nastanitve kot beseda, ki jo nastanitevIz() spet prepozna. */
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
 * Opis, ki ga shranimo: naslov in STRUKTURIRANA dejstva, nič besedila
 * agencije. Dovolj za iskalnik ("Lucija 75 m²") in za osrednji detektor
 * nastanitev, ki mu razbrano vrsto in število enot zapišemo z besedami, ki
 * jih zna prebrati ("hotel, 24 enot").
 */
function sestaviOpis(k: KarticaAcasa): string {
  const deli: (string | null)[] = [
    k.naslov,
    k.tip ? k.tip.replace("_", " ").replace("hisa", "hiša").replace("garaza", "garaža") : null,
    k.velikostM2 !== null ? (k.tip === "posest" ? `${k.velikostM2} m² zemljišča` : `${k.velikostM2} m²`) : null,
    k.spalnic !== null ? `spalnice: ${k.spalnic}` : null,
    k.kopalnic !== null ? `kopalnice: ${k.kopalnic}` : null,
    k.lokacije.length > 0 ? k.lokacije.join(", ") : null,
    k.drzava === "IT" ? "Italija" : k.drzava === "HR" ? "Hrvaška" : null,
    k.status && !/^(?:prodaja|oddaja|najem)$/i.test(k.status) ? `status pri viru: ${k.status.toLowerCase()}` : null,
    k.nastanitev.vrsta
      ? [NASTANITEV_BESEDA[k.nastanitev.vrsta] ?? k.nastanitev.vrsta, k.nastanitev.enot ? `${k.nastanitev.enot} enot` : null]
          .filter(Boolean)
          .join(", ")
      : null,
  ];
  return deli.filter(Boolean).join(", ");
}

/**
 * Gradnik "Lokacijah" -> { "Trst": 11, "Občina Koper": 4, ... }. Šteje oglase
 * vseh statusov, tako kot seznam kartic (preverjeno 29. 9. 2026: 27 = 27).
 */
function stetjePoLokacijah(html: string): Map<string, number> {
  const stetje = new Map<string, number>();
  const blok = blokGradnika(html, /class="wdk-locations-grid-cover\b/);
  if (blok === null) return stetje;
  const re = /<h3 class="wdk-title">([^<]*)<\/h3>\s*<span class="wdk-listings-count">\s*(\d+)\s*Listings?/g;
  for (const m of blok.matchAll(re)) stetje.set(brezEntitet(m[1]).trim(), Number(m[2]));
  return stetje;
}

/** Čisto razčlenjevanje strani — brez omrežja, zato ga je mogoče preizkusiti na shranjeni strani. */
export function karticeIzHtml(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const blok = blokRezultatov(html);
  // Brez bloka rezultatov ne vemo nič — lahko je spremenjena stran ali tiha
  // zavrnitev. null pusti glavni zanki previdno vedenje.
  if (blok === null) return { kartice: [], zadnjaStran: null, skupajZadetkov: null };

  const kosi = blok.split(/<div\s+data-listing_url\s*=/).slice(1);
  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  /** Vse kartice (tudi prodane) po lokaciji — za preverbo okrnjenosti. */
  const naLokaciji = new Map<string, number>();

  for (const kos of kosi) {
    const url = kos.match(/^\s*"([^"]+)"/)?.[1] ?? null;
    const id = kos.match(/data-listing_id\s*=\s*"(\d+)"/)?.[1] ?? null;
    const naslov = polje(kos, /wdk-field-post_title['"]>([\s\S]*?)<\/span>/);
    if (!url || !id || !naslov || videni.has(id)) continue;
    videni.add(id);

    const lokacije = [
      ...new Set(
        (polje(kos, /wdk-field-location_id['"]>([\s\S]*?)<\/span>/) ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ];
    for (const l of lokacije) naLokaciji.set(l, (naLokaciji.get(l) ?? 0) + 1);

    const status = polje(kos, /wdk-field-5['"]>([\s\S]*?)<\/span>/);
    if (status && NI_NA_TRGU.test(status)) continue;

    const lastnosti: Record<string, string> = {};
    for (const del of kos.split("wdk-field-item").slice(1)) {
      const oznaka = del.match(/wdk-rc-field-label">([^<]*)</)?.[1];
      const vrednost = del.match(/wdk-rc-field-value">([^<]*)</)?.[1];
      if (oznaka && vrednost && vrednost.trim() !== "") {
        lastnosti[brezEntitet(oznaka).replace(/:\s*$/, "").trim()] = brezEntitet(vrednost).trim();
      }
    }
    const velikostM2 = m2(lastnosti["Velikost"]);
    const spalnic = m2(lastnosti["Spalnice"]);
    const kopalnic = m2(lastnosti["Kopalnice"]);

    // Kratek opis agencije beremo SAMO za dejstva; v kartico ne gre.
    const kratekOpis = polje(kos, /wdk-field-2">([\s\S]*?)<\/span>/) ?? "";
    // izOpisa pozna "m2" in "l. 2002", vir pa piše "m²" in "leta 2002".
    const zaDejstva = `${naslov}. ${kratekOpis}`.replace(/m²/g, "m2").replace(/\bleta\s+(\d{4})\b/gi, "l. $1");

    const slug = url.replace(/\/+$/, "").split("/").pop() ?? id;
    const tip = vrsta(naslov) ?? vrsta(kratekOpis);
    const lok = lokacija(lokacije, naslov, slug);
    const k: KarticaAcasa = {
      id,
      slug,
      status,
      lokacije,
      naslov,
      cena: polje(kos, /class="wdk-price">([\s\S]*?)<\/div>/),
      lastnosti,
      velikostM2,
      spalnic,
      kopalnic,
      drzava: lok.drzava,
      tip,
      podtip: podvrsta(tip, naslov),
      kraj: lok.kraj,
      regija: lok.regija,
      izOpisa: izOpisa(zaDejstva),
      nastanitev: nastanitevIz(zaDejstva, tip),
    };

    kartice.push({
      url,
      virId: id,
      lokacija: lokacije.join(", ") || null,
      naslovVrstica: naslov,
      opis: sestaviOpis(k),
      cenaBesedilo: cenaBesedilo(k.cena),
      telefon: null,
      agencija: AGENCIJA,
      // Fotografije so avtorsko delo agencije — ne kopiramo in ne povezujemo.
      slika: null,
      stSlik: (kos.match(/class="wdk-image"/g) ?? []).length || null,
      surovo: k as unknown as Record<string, unknown>,
    });
  }

  // Paginacija samo iz bloka rezultatov (stranski gradniki imajo svoje povezave).
  const strani = [...blok.matchAll(/[?&]wmvc_paged=(\d+)/g)].map((m) => Number(m[1]));
  const zadnjaStran = strani.length > 0 ? Math.max(stran, ...strani) : stran;

  /**
   * PREVERBA OKRNJENOSTI — samo na strani, ki trdi, da je cel seznam (brez
   * paginacije). Če gradnik "Lokacijah" za lokacijo šteje več oglasov, kot je
   * na strani kartic s to oznako, gradnik z rezultati reže rep kataloga.
   * Glasna napaka (razred "parser") ustavi krog brez hlajenja; tiho branje
   * bi pomenilo, da odrezane oglase čez dva kroga razglasimo za izginule.
   */
  if (strani.length === 0) {
    for (const [lok, stevilo] of stetjePoLokacijah(html)) {
      const najdenih = naLokaciji.get(lok) ?? 0;
      if (najdenih < stevilo) {
        throw new Error(
          `neznana struktura strani: gradnik lokacij šteje ${stevilo} oglasov za "${lok}", ` +
            `na strani jih je ${najdenih} — seznam na naslovnici je okrnjen, beri /grid-map/?wmvc_paged=N`
        );
      }
    }
  }

  // "34 Listings" pove samo /grid-map/. Na naslovnici je blok rezultatov
  // najden, zato je število kartic na trgu izmerjeno (0 = res prazno).
  const naGridu = html.match(/<span>\s*(\d+)\s*Listings?\s*<\/span>/)?.[1];
  const skupajZadetkov = naGridu !== undefined ? Number(naGridu) : kartice.length;
  return { kartice, zadnjaStran, skupajZadetkov };
}

/**
 * Prazen odgovor strežnika (curl 52; v Node "other side closed") je pri tem
 * majhnem gostitelju znak dušenja — skeptik ga je dobil po štirih sekundah
 * razmika, po dvajsetih pa je stran prišla. Zato ga javimo kot omejevanje
 * (rate limit): glavna zanka vir ohladi in NE poskuša takoj znova.
 */
async function prenesiVljudno(url: string, ua: string): Promise<string> {
  try {
    return await prenesi(url, ua);
  } catch (e) {
    const opis = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e);
    if (/other side closed|UND_ERR_SOCKET|socket hang up|ECONNRESET/i.test(opis)) {
      throw new Error("prazen odgovor strežnika — pri tem gostitelju pomeni rate limit, zato hlajenje in ne ponovni poskus");
    }
    throw e;
  }
}

async function preberiHttp(
  r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  const html = await prenesiVljudno(seznamUrl(r, stran), ua);
  const izid = karticeIzHtml(html, stran);
  // Paginacija, ki bi kazala drugam kot seznamUrl(), bi pomenila branje
  // napačnih strani — raje glasno kot tiho.
  if ((izid.zadnjaStran ?? 1) > 1 && !html.includes(`${OSNOVA}/?wmvc_paged=`)) {
    throw new Error("neznana struktura strani: naslovnica ima paginacijo v nepričakovani obliki");
  }
  return izid;
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const s = (k.surovo ?? {}) as unknown as KarticaAcasa;
  const iz = s.izOpisa;
  const nast = s.nastanitev;
  const status = s.status ?? "";
  const posel =
    /^(?:oddaja|najem)$/i.test(status) || (!/^prodaja$/i.test(status) && /\boddaj|\bnajem/i.test(s.naslov ?? ""))
      ? "oddaja"
      : "prodaja";

  // Velikost je pri zemljišču parcela, sicer bivalna/uporabna površina.
  const jePosest = s.tip === "posest";
  const povrsinaM2 = jePosest ? null : s.velikostM2 ?? iz?.povrsinaM2 ?? null;
  const zemljisceM2 = jePosest ? s.velikostM2 ?? iz?.zemljisceM2 ?? iz?.povrsinaM2 ?? null : iz?.zemljisceM2 ?? null;

  // Enote samo, ko jih vir TRDI: izOpisa ("ima 3 stanovanja") ali sobe v
  // nastanitvenem kontekstu. Spalnice hiše niso enote.
  const stEnot = iz?.stEnot ?? (nast?.vrsta ? nast.enot : null);
  const stEnotOcena = iz?.stEnotOcena ?? nast?.enotOcena ?? null;

  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip: s.tip ?? null,
    podtip: s.podtip ?? null,
    posel,
    regija: s.regija ?? null,
    kraj: s.kraj ?? null,
    cenaEur: stevilo(k.cenaBesedilo ?? undefined),
    povrsinaM2,
    zemljisceM2,
    letoIzgradnje: iz?.letoIzgradnje ?? null,
    letoAdaptacije: iz?.letoAdaptacije ?? null,
    nadstropje: iz?.nadstropje ?? null,
    vecEnot: Boolean(iz?.vecEnot) || (stEnot !== null && stEnot >= 2),
    stEnot,
    stEnotOcena,
    loceneKuhinje: iz?.loceneKuhinje ?? null,
    looceniVhodi: iz?.looceniVhodi ?? null,
    zaObnovo: Boolean(iz?.zaObnovo),
    zaInvesticijo: Boolean(iz?.zaInvesticijo) || Boolean(nast?.vrsta),
    opis: k.opis,
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
  // Crawl-delay ni naveden; 8 s je naš privzeti razmik (skeptik je predlagal
  // vsaj 5 s). Pri enem zahtevku na dan razmik skoraj ne pride do izraza.
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  // 29. 9. 2026: 34 kartic, od tega 29 na trgu. Pod deset je verjetneje
  // pokvarjeno branje kot izpraznjena agencija.
  pricakovanRazpon: [10, 300],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  // Cel katalog je ena stran: en krog = en zahtevek, na dan en krog (drugi
  // termin urnika se zaradi dnevne meje preskoči). Če bi naslovnica dobila
  // paginacijo, se krog razpotegne čez več dni — do petih strani je obhod
  // še vedno krajši od petih dni.
  najvecStrani: 1,
  najvecStraniNaRezino: 6,
  dnevnaMejaStrani: 1,
  dnevniProracunVira: 2,
  // Vrstni red ni po novosti (izpostavljeni oglasi so spredaj) — in pri eni
  // strani inkrementalno branje nima česa prihraniti.
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (29. 9. 2026): ena skupina za * s praznim Disallow, brez Crawl-delay in brez Content-Signal — " +
    "naslovnica, ki jo beremo, je dovoljena. Edini pogoji na spletišču so posredniški Splošni pogoji poslovanja " +
    "(7. 10. 2024) za naročitelje po ZNPosr, ki o rabi spletišča, robotih ali zbirkah ne govorijo; noga ima le " +
    "»Copyright © 2024 ACASA GROUP g.i.z.«. Presoja in dva neodvisna skeptika (pravni + tehnični) omejitve niso našli. " +
    "POGOJI: hranimo samo dejstva (cena, m², kraj, status, povezava) — opisov in fotografij agencije ne kopiramo in ne " +
    "povezujemo, detajlnih strani ne beremo (vsak obisk jim šteje ogled), na dan en sam zahtevek z razmikom ≥ 8 s.",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("acasa.si se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
