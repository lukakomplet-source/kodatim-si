import type { NormaliziranOglas } from "../db.js";
import { stevilo } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, goloBesedilo, prenesi } from "./http.js";

/**
 * sloveniaestates.com — majhna agencija (pisarni v Ljubljani in Kobaridu), ~96
 * oglasov, v angleščini za tuje kupce.
 *
 * Zakaj ta vir: ima nastanitvene in gostinske objekte, ki jih drugje ni —
 * hotel v Komnu (10 sob), gostišče na Krasu (7 sob), butični hotel v Poljanah —
 * in posestva v Posočju, na Krasu in Gorenjskem. Cene so agencijske, za tujce;
 * signala "pod tržno ceno" tu ni.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt: ena skupina za *, prazen Disallow — vse poti dovoljene.
 *     Crawl-delay in Content-Signal nista navedena.
 *   - Acceptable Use Policy (27. 5. 2022) o robotih, avtomatskem zajemu,
 *     meta-iskanju ali zbirkah ne pove ničesar. Pravi pa, da vir "ne podeli
 *     nobene licence za avtorske pravice". Zato hranimo SAMO DEJSTVA (cena, m2,
 *     vrsta, kraj, leto, šifra, število sob kot številko) in povezavo nazaj.
 *     Angleških opisov NE shranjujemo — preberemo jih le, da iz njih izluščimo
 *     število sob ali stanovanj; v bazo gre številka, ne besedilo. Fotografij
 *     ne kopiramo; slika_url je le povezava na izvirnik (robots.txt jo dovoli).
 *   - novi-list.com je ista namestitev WordPressa (isti ?p= id-ji) — ne beremo
 *     ga, sicer bi bil vsak oglas dvakrat. Ne kličemo /wp-json/ (ni preverjeno,
 *     da je namenjen javni rabi), ne "Printable details" in ne "Email inquiry".
 *
 * TEHNIČNO — ZAKAJ JE "STRAN" TU EN OGLAS.
 * Vir nima seznama, ki bi povedal kraj, leto ali število sob; to je samo na
 * detajlni strani. Ima pa en sam property-sitemap.xml z vsemi oglasi in
 * njihovim <lastmod>. Zato je rezina ena, njena "stran N" pa je N-ti oglas v
 * kazalu (sitemap), razvrščenem po lastmod od najnovejšega. Vsak zahtevek
 * glavne zanke je tako natanko en obisk ene strani vira — isti ritem, isti
 * dnevni proračun, ista obravnava blokad kot pri vseh ostalih virih.
 *
 * Kazalo se prebere znotraj preberiHttp (en dodaten zahtevek na krog) in se
 * hrani v pomnilniku procesa KAZALO_VELJA_MS — glej opombo pri preberiHttp.
 */

const VIR = "sloveniaestates.com";
const OSNOVA = "https://www.sloveniaestates.com";
const GOSTITELJ = "www.sloveniaestates.com";
const KAZALO_URL = `${OSNOVA}/property-sitemap.xml`;
/** Crawl-delay ni naveden; 8 s je naš privzeti razmik za tuje vire. */
const ZAMIK_MS = 8_000;
/**
 * Krog ~24 strani traja pri 8 s razmika nekaj minut. Pol ure pomeni: vsak
 * krog prebere kazalo enkrat na začetku, naslednji krog (ure kasneje) znova —
 * tako se ne zgodi, da bi ves dan hodili po zastarelem kazalu do oglasov, ki
 * jih ni več.
 */
const KAZALO_VELJA_MS = 30 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ena vrstica kazala: detajlna stran in kdaj jo je vir nazadnje spremenil. */
export type VnosKazala = { url: string; lastmod: string | null };

/**
 * Oglasi, ki jih NE beremo, prepoznani že po slug-u (in zato ne stanejo
 * zahtevka): najemi ("-rental", "min-stay-1-month") in hrvaški oglasi
 * ("croatia-…"). Presoja je oboje izrecno izločila — najem za mesec dni ni
 * nepremičninski posel, ki ga iščemo, hrvaški oglasi pa niso slovenski trg.
 */
const NAJEM_V_SLUGU = /-rental$|-(?:for|to)-rent$|(?:^|-)min-stay(?:-|$)/;
const TUJINA_V_SLUGU = /^croatia-/;

/** Kazalo iz property-sitemap.xml — čisto, brez omrežja. Najnovejši lastmod prvi. */
export function kazaloIzSitemapa(xml: string): VnosKazala[] {
  const vnosi: VnosKazala[] = [];
  const videni = new Set<string>();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    let pot: string;
    try {
      const u = new URL(brezEntitet(loc));
      if (u.hostname !== GOSTITELJ) continue;
      pot = u.pathname;
    } catch {
      continue;
    }
    // Oglasi so na korenskem slug-u (/<slug>/). /property/ je arhiv, ne oglas.
    const slug = pot.replace(/^\/+|\/+$/g, "");
    if (!slug || slug.includes("/") || slug === "property") continue;
    const slugMali = decodeURIComponent(slug).toLowerCase();
    if (NAJEM_V_SLUGU.test(slugMali) || TUJINA_V_SLUGU.test(slugMali)) continue;
    const url = `${OSNOVA}/${slug}/`;
    if (videni.has(url)) continue;
    videni.add(url);
    vnosi.push({ url, lastmod: m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] ?? null });
  }
  /**
   * Od najnovejše spremembe navzdol. Yoast piše sitemap od najstarejše, a
   * prav nove in spremenjene (nova cena) želimo videti prve — inkrementalni
   * prelet glavne zanke (razvrsceniPoNovosti) prebere vrh kazala vsak krog.
   * Enak lastmod: po URL-ju, da je vrstni red med krogi stabilen.
   */
  const cas = (v: VnosKazala) => (v.lastmod ? Date.parse(v.lastmod) || 0 : 0);
  return vnosi.sort((a, b) => cas(b) - cas(a) || a.url.localeCompare(b.url));
}

// ————————————————————————————————————————————————————————————————
// KAZALO V POMNILNIKU IN BRANJE
// ————————————————————————————————————————————————————————————————

let kazalo: { vnosi: VnosKazala[]; ob: number } | null = null;

function seznamUrl(_r: Rezina, stran: number): string {
  // Za dnevnik in nep_napake: pravi naslov oglasa, če kazalo poznamo.
  return kazalo?.vnosi[stran - 1]?.url ?? `${KAZALO_URL}#${stran}`;
}

const jeIzginil = (sporocilo: string) => /HTTP 40[4]|HTTP 410/.test(sporocilo);

/**
 * En klic glavne zanke = en oglas (stran N = N-ti oglas v kazalu).
 *
 * Kadar je treba kazalo osvežiti, gresta v tem klicu DVA zahtevka. Skupni ritem
 * (pocakajNaVrsto) je zaznamoval samo prvega, zato: po sitemapu počakamo
 * ZAMIK_MS pred detajlom in še enkrat ZAMIK_MS po njem — sicer bi naslednji
 * klic zanke (ki meri razmik od zaznamka PRED sitemapom) šel takoj za našim
 * detajlom. To se zgodi enkrat na krog; ostali klici so en zahtevek.
 *
 * Prazen rezultat vrnemo samo v dveh primerih, oba sta resnična:
 *   - stran je za koncem kazala (katalog se je skrčil) -> skupajZadetkov = n,
 *     glavna zanka rezino pravilno zaključi;
 *   - oglas je med tem izginil (404/410 ali preusmeritev drugam) -> kazalo
 *     zavržemo, da ga naslednji klic prebere znova; skupajZadetkov = null, da
 *     glavna zanka tega ne razglasi za spremenjen HTML.
 * Vse ostalo (403/429/CAPTCHA, 5xx) gre naprej kot napaka — obravnava blokad
 * je naloga glavne zanke, ne adapterja.
 */
async function preberiHttp(
  _r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  let osvezeno = false;
  let vnosi = kazalo && Date.now() - kazalo.ob <= KAZALO_VELJA_MS ? kazalo.vnosi : null;
  if (!vnosi) {
    vnosi = kazaloIzSitemapa(await prenesi(KAZALO_URL, ua, { jezik: "en" }));
    if (vnosi.length === 0) {
      throw new Error("neznana struktura strani: property-sitemap.xml brez oglasov");
    }
    kazalo = { vnosi, ob: Date.now() };
    osvezeno = true;
  }
  const n = vnosi.length;
  const vnos = vnosi[stran - 1];
  if (!vnos) return { kartice: [], zadnjaStran: n, skupajZadetkov: n };

  if (osvezeno) await sleep(ZAMIK_MS);
  let html: string;
  try {
    html = await prenesi(vnos.url, ua, { jezik: "en" });
  } catch (err) {
    const sporocilo = err instanceof Error ? err.message : String(err);
    if (jeIzginil(sporocilo)) {
      kazalo = null;
      return { kartice: [], zadnjaStran: n, skupajZadetkov: null };
    }
    throw err;
  } finally {
    if (osvezeno) await sleep(ZAMIK_MS);
  }

  const { kartice } = karticeIzHtml(html);
  if (kartice.length === 0) {
    // Odstranjen oglas WordPress pogosto preusmeri na drugo stran (200). Ali
    // gre za to ali za spremenjeno predlogo, pove kanonični naslov.
    const kanonicni = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;
    if (kanonicni !== vnos.url) {
      kazalo = null;
      return { kartice: [], zadnjaStran: n, skupajZadetkov: null };
    }
    throw new Error(`neznana struktura strani: ${vnos.url} nima bloka "Property details"`);
  }
  for (const k of kartice) k.surovo = { ...k.surovo, lastmod: vnos.lastmod };
  return { kartice, zadnjaStran: n, skupajZadetkov: n };
}

// ————————————————————————————————————————————————————————————————
// RAZČLENJEVANJE DETAJLNE STRANI
// ————————————————————————————————————————————————————————————————

/** Kar hranimo o oglasu — sama dejstva, brez besedila opisa in brez slik. */
type Dejstva = {
  postId: string | null;
  sifra: string | null;
  naslov: string;
  lastnosti: Record<string, string>;
  regijaVira: string | null;
  regijaSidro: string | null;
  bliznina: Record<string, string>;
  datumObjave: string | null;
  datumSpremembe: string | null;
  najem: boolean;
  /** Števila iz opisa vira — številke, ne besedilo (pogoji: ni licence za besedilo). */
  enote: {
    nastanitev: string | null;
    sob: number | null;
    stanovanj: number | null;
    enot: number | null;
    moznihEnot: number | null;
  };
  zaObnovo: boolean;
  lastmod?: string | null;
};

/** Pari oznaka/vrednost iz enega bloka `<span class="left">…<span class="right">`. */
function pari(blok: string): Record<string, string> {
  const izid: Record<string, string> = {};
  for (const m of blok.matchAll(/<span class="left">([\s\S]*?)<\/span>\s*<span class="right">([\s\S]*?)<\/span>/g)) {
    const oznaka = goloBesedilo(m[1]).replace(/:\s*$/, "").trim();
    const vrednost = goloBesedilo(m[2]);
    if (oznaka && vrednost) izid[oznaka] = vrednost;
  }
  return izid;
}

/** Blok, ki se začne z danim naslovom h2, do konca njegovega <ul>/<div>. */
function blokPoNaslovu(html: string, naslov: string): string | null {
  const i = html.indexOf(`<h2 class="smaller">${naslov}</h2>`);
  if (i < 0) return null;
  const konec = html.indexOf(`<div class="box`, i + 10);
  return html.slice(i, konec > i ? konec : i + 20_000);
}

const BESEDNA: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
const N = `(\\d{1,3}|${Object.keys(BESEDNA).join("|")})`;
const BESEDE = "((?:[a-z][a-z'’-]*\\s+){0,3}?)";
const vStevilo = (s: string) => BESEDNA[s] ?? Number(s);

/**
 * VRSTE NASTANITVE v angleščini. Vrstni red je prednost ("restaurant and a
 * hotel" je hotel). "Hospitality" sama NI nastanitev — to je lahko gostilna
 * brez ene sobe (Tržič: pub z restavracijo in pisarnami).
 */
const VRSTE: [string, RegExp][] = [
  // Samo ednina: oglas prodaja EN objekt; "Bled offers many hotels" opisuje okolico.
  ["hotel", /\b(?:apart[\s-]?)?hotel\b/],
  ["penzion", /\b(?:guest[\s-]?house|pension|b\s?&\s?b|bed\s+(?:and|&)\s+breakfast)\b/],
  ["gostišče", /\binn\b/],
  ["hostel", /\bhostel\b/],
  ["motel", /\bmotel\b/],
  [
    "nastanitveni objekt",
    /\baccommodation\s+(?:facilit|business|propert|units?|capacit)|\bholiday\s+apartments\b|\bapartment\s+house\b|\btourist\s+(?:farm|accommodation)/,
  ],
];

/** Beseda pred vrsto, ki pove, da gre za SOSEDA: "3 km from the hotel". */
const SOSED_PRED =
  /(?:\bnear|\bnearby|close\s+to|next\s+to|\bopposite|\bbeside|\bbehind|\babove|\bbelow|\bfrom|walk(?:ing)?\s+to|\bto|\bfamous|\bmany|\bseveral|\bnumerous|\bits|\bother|\bthe\s+nearest)\s+(?:the\s+|a\s+|an\s+)?(?:[\w'’-]+\s+){0,2}$/;

/**
 * Stavek, ki govori o MOŽNOSTI in ne o stanju: "can be converted into
 * accommodation units", "potential to develop three duplex apartments".
 * Taka številka je ocena (stEnotOcena), nikoli trditev.
 */
const MOZNOST =
  /\b(?:potential|possib\w*|could|convert\w*|conversion|develop\w*|transform\w*|options?|planned|project\w*|permits?|would|ideal\s+for|suitable\s+for|can\s+be)\b/;

/** Sobe, ki niso sobe za goste. */
const NI_SOBA_ZA_GOSTE =
  /\b(?:dining|living|storage|store|meeting|conference|seminar|function|banquet|party|utility|boiler|technical|reception|treatment|massage|office|tasting|common|staff|changing|plant|machine|wine|sitting|breakfast|laundry|auxiliary|service|games|fitness|spa)\b/;

function najvec(t: string, re: RegExp, min: number, max: number, zavrni?: RegExp): number | null {
  let naj: number | null = null;
  for (const m of t.matchAll(re)) {
    if (zavrni && m[2] && zavrni.test(m[2])) continue;
    const n = vStevilo(m[1]);
    if (Number.isFinite(n) && n >= min && n <= max && (naj === null || n > naj)) naj = n;
  }
  return naj;
}

function vrstaIz(t: string): string | null {
  for (const [ime, re] of VRSTE) {
    for (const m of t.matchAll(new RegExp(re.source, "g"))) {
      const kje = m.index ?? 0;
      if (SOSED_PRED.test(t.slice(Math.max(0, kje - 40), kje))) continue;
      return ime;
    }
  }
  return null;
}

/**
 * Število sob / stanovanj / enot iz opisa — SAMO številke. Sobe štejejo kot
 * enote le pri nastanitvenem objektu (hotel z 10 sobami je 10 enot, hiša s
 * tremi spalnicami je ena enota). Stanovanja v množini štejejo vedno ("Three
 * Separate Apartments" v večstanovanjski hiši na Viču).
 */
/**
 * `komercialno`: pri hiši, stanovanju ali parceli se vrsta nastanitve bere
 * SAMO iz naslova in prvih 150 znakov opisa, kot v parse.ts (SAMO_ZACETEK).
 * Recenzija 29. 9. 2026: "The famous Grand Hotel Toplice is only 5 minutes
 * away" globoko v opisu hiše jo je naredil za hotel.
 */
function enoteIzOpisa(naslov: string, opisHtml: string, komercialno: boolean): Dejstva["enote"] {
  // Ne deli po </strong>: "<strong>Two guest houses</strong>, … are planned."
  // bi izgubil "planned" in parcela z gradbenim dovoljenjem bi postala penzion.
  const bloki = opisHtml
    .split(/<\/p>|<br\s*\/?>|<\/li>|<\/h\d>|<\/div>/i)
    .map((b) => goloBesedilo(b).toLowerCase())
    .filter(Boolean);
  const stavki = [naslov.toLowerCase(), ...bloki].flatMap((b) => b.split(/(?<=[.!?;])\s+/));
  const trditve = stavki.filter((s) => !MOZNOST.test(s));
  const moznosti = stavki.filter((s) => MOZNOST.test(s));

  // Vrsta objekta samo iz stavkov, ki govorijo o stanju: "could be converted
  // into a boutique hotel" hiše še ne naredi za hotel.
  let nastanitev: string | null = null;
  const zacetek = `${naslov.toLowerCase()} ${(bloki[0] ?? "").slice(0, 150)}`;
  const kjeIskati = komercialno ? trditve : [zacetek].filter((s) => !MOZNOST.test(s));
  for (const s of kjeIskati) {
    nastanitev = vrstaIz(s);
    if (nastanitev) break;
  }

  const sobeRe = new RegExp(`(?<![\\d.,])\\b${N}\\s+${BESEDE}(?:guest\\s+)?rooms\\b`, "g");
  const spalniceRe = new RegExp(`(?<![\\d.,])\\b${N}\\s+${BESEDE}(?:en[\\s-]?suite|guest|letting|hotel)\\s+bedrooms\\b`, "g");
  const sobniHotelRe = new RegExp(`(?<![\\d.,])\\b(\\d{1,3})[\\s-]rooms?\\s+()(?:boutique\\s+)?(?:hotel|guest\\s?house|inn|b&b|pension)`, "g");
  const stanovanjaRe = new RegExp(`(?<![\\d.,])\\b${N}\\s+${BESEDE}(?:apartments|flats|residential\\s+units|housing\\s+units)\\b`, "g");
  const enoteRe = new RegExp(`(?<![\\d.,])\\b${N}\\s+${BESEDE}(?:accommodation|holiday|rental|tourist|guest)\\s+units\\b`, "g");

  const zberi = (izbor: string[], sNastanitvijo: boolean) => {
    let sob: number | null = null;
    let stanovanj: number | null = null;
    let enot: number | null = null;
    const max = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
    for (const s of izbor) {
      const tuNastanitev = sNastanitvijo || vrstaIz(s) !== null;
      if (tuNastanitev) {
        sob = max(sob, najvec(s, sobeRe, 2, 500, NI_SOBA_ZA_GOSTE));
        sob = max(sob, najvec(s, spalniceRe, 2, 500));
        sob = max(sob, najvec(s, sobniHotelRe, 2, 500));
        enot = max(enot, najvec(s, enoteRe, 2, 500));
      }
      stanovanj = max(stanovanj, najvec(s, stanovanjaRe, 2, 300));
    }
    return { sob, stanovanj, enot };
  };

  const t = zberi(trditve, nastanitev !== null);
  const m = zberi(moznosti, nastanitev !== null);
  const moznih = [m.sob, m.stanovanj, m.enot].filter((x): x is number => x !== null);
  return {
    nastanitev,
    sob: t.sob,
    stanovanj: t.stanovanj,
    enot: t.enot,
    moznihEnot: moznih.length > 0 ? Math.max(...moznih) : null,
  };
}

const ZA_OBNOVO =
  /\b(?:for|in\s+need\s+of|needs?|requires?|requiring)\s+(?:a\s+)?(?:full\s+|complete\s+|total\s+|some\s+|major\s+)?renovation\b|\bto\s+renovate\b|\brenovation\s+project\b|\bruin\b/i;
/**
 * Najem, ki ga slug ne izda ("…-apartment-with-elevator" je "MONTH BY MONTH
 * RENTAL" za 2.750 €). "Rental income" v naslovu prodajne hiše NI najem, zato
 * velja samo "rental" na koncu naslova ali z velikimi črkami.
 */
const NAJEM_V_NASLOVU =
  /\b(?:for|to)\s+rent\b|month[\s-]+by[\s-]+month|\bmin(?:imum)?[\s.-]*stay\b|\/\s*month\b|\bper\s+month\b|\brental\s*\)?\s*$/i;
const NAJEM_VELIKE = /\bRENTAL\b/;

/**
 * Čisto razčlenjevanje ENE detajlne strani — brez omrežja, zato ga je mogoče
 * preizkusiti na shranjeni strani. Vrne 0 ali 1 kartico; zadnjaStran in
 * skupajZadetkov pozna samo kazalo (preberiHttp jih dopolni).
 */
export function karticeIzHtml(
  html: string
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const prazno = { kartice: [], zadnjaStran: null, skupajZadetkov: null };
  const blokPodrobnosti = blokPoNaslovu(html, "Property details");
  if (!blokPodrobnosti) return prazno;
  const lastnosti = pari(blokPodrobnosti);
  if (Object.keys(lastnosti).length === 0) return prazno;

  const url = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;
  if (!url) return prazno;
  const postId =
    html.match(/rel='shortlink' href='[^']*\?p=(\d+)'/)?.[1] ??
    html.match(/printable-details\/\?id=(\d+)/)?.[1] ??
    null;
  const naslov =
    [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
      .map((m) => goloBesedilo(m[1]))
      .find((t) => t && t.toLowerCase() !== "description") ?? "";

  const blokRegije = blokPoNaslovu(html, "Region");
  const regija = blokRegije?.match(/<h3>\s*<a href="#([^"]*)">([\s\S]*?)<\/a>/);
  const blokBliznine = blokPoNaslovu(html, "Ratings and proximity");

  // Datuma objave in spremembe iz Yoastovega JSON-LD (opisa od tam NE jemljemo).
  let datumObjave: string | null = null;
  let datumSpremembe: string | null = null;
  const ld = html.match(/<script type="application\/ld\+json" class="yoast-schema-graph">([\s\S]*?)<\/script>/)?.[1];
  if (ld) {
    try {
      const graf = (JSON.parse(ld) as { "@graph"?: { "@type"?: string; datePublished?: string; dateModified?: string }[] })[
        "@graph"
      ];
      const spletna = graf?.find((g) => g["@type"] === "WebPage");
      datumObjave = spletna?.datePublished ?? null;
      datumSpremembe = spletna?.dateModified ?? null;
    } catch {
      // Pokvarjen JSON-LD ni razlog, da oglasa ne preberemo — datuma sta dodatek.
    }
  }

  const opisHtml = html.match(/<h1>Description<\/h1>([\s\S]*?)<div class="col-md-4">/)?.[1] ?? "";
  const enote = enoteIzOpisa(naslov, opisHtml, tipIz(lastnosti["Type"], naslov) === "poslovni_prostor");
  const sifra = lastnosti["Property code"] ?? null;
  const najem = NAJEM_V_NASLOVU.test(naslov) || NAJEM_VELIKE.test(naslov);

  // Slika: samo povezava na izvirnik (robots.txt dovoli, datoteke ne kopiramo).
  const slika = html.match(/<div id="main_image_crossfade"[\s\S]*?<img[^>]*?\ssrc="([^"]+)"/)?.[1] ?? null;
  const galerija = new Set([...html.matchAll(/data-fancybox="main1"[\s\S]*?data-src="([^"]+)"/g)].map((m) => m[1]));

  const dejstva: Dejstva = {
    postId,
    sifra,
    naslov,
    lastnosti,
    regijaVira: regija ? goloBesedilo(regija[2]) : null,
    regijaSidro: regija ? regija[1] : null,
    bliznina: blokBliznine ? pari(blokBliznine) : {},
    datumObjave,
    datumSpremembe,
    najem,
    enote,
    zaObnovo: ZA_OBNOVO.test(naslov) || ZA_OBNOVO.test(goloBesedilo(opisHtml)),
  };

  const kraj = lastnosti["City"] ?? null;
  return {
    kartice: [
      {
        url,
        // Šifra agencije (JM1815) je stabilnejša od slug-a; "-2" slug-i so
        // pogosto isti oglas, objavljen znova. Najem dobi svojo identiteto.
        virId: `${sifra ?? (postId ? `p${postId}` : url.replace(/^https?:\/\/[^/]+\/|\/$/g, ""))}${najem ? "-oddaja" : ""}`,
        lokacija: [kraj, dejstva.regijaVira].filter(Boolean).join(", ") || null,
        naslovVrstica: naslov || null,
        opis: opisIzDejstev(dejstva),
        cenaBesedilo: lastnosti["Price in Euros"] ?? null,
        telefon: null,
        agencija: AGENCIJA,
        slika,
        stSlik: galerija.size > 0 ? galerija.size : null,
        surovo: dejstva as unknown as Record<string, unknown>,
      },
    ],
    zadnjaStran: null,
    skupajZadetkov: null,
  };
}

const AGENCIJA = "Slovenia Estates (sloveniaestates.com)";

// ————————————————————————————————————————————————————————————————
// NORMALIZACIJA
// ————————————————————————————————————————————————————————————————

/** Vrsta pri viru -> naš tip. Vir pozna House, Apartment, Land, Commercial. */
function tipIz(vrsta: string | undefined, naslov: string): string | null {
  const v = (vrsta ?? "").toLowerCase();
  const pravila: [RegExp, string][] = [
    [/apartment|flat|studio|penthouse|maisonette|duplex/, "stanovanje"],
    [/garage|parking/, "garaza"],
    [/commercial|business|office|hotel|restaurant|guest|hospitality|retail|shop|warehouse|industrial|camp/, "poslovni_prostor"],
    [/land|plot|forest|agricultural/, "posest"],
    [/house|villa|farm|cottage|estate|castle|manor|chalet|home/, "hisa"],
  ];
  for (const [re, tip] of pravila) if (re.test(v)) return tip;
  // Brez polja Type: previdno po naslovu, sicer raje nič kot napačno.
  const n = naslov.toLowerCase();
  if (/\bapartment\b/.test(n)) return "stanovanje";
  if (/\b(?:building\s+)?(?:land|plot)\b/.test(n)) return "posest";
  if (/\b(?:hotel|restaurant|office|commercial)\b/.test(n)) return "poslovni_prostor";
  if (/\b(?:house|villa|cottage|farmhouse)\b/.test(n)) return "hisa";
  return null;
}

/** "704 m2", "175,50 m2", "3.385 m2", "4 ha" -> m². */
function povrsinaIz(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/(\d[\d.,]*)\s*(m2|m²|sqm|sq\.?\s*m|ha|hectares?)?/i);
  if (!m) return null;
  const n = stevilo(m[1]);
  if (n === null || n <= 0) return null;
  return /^h/i.test(m[2] ?? "") ? Math.round(n * 10_000) : n;
}

/** "1.900.000 €", "2.750 €", "259000", "Price on application" -> € ali null. */
function cenaIzVrednosti(v: string | null): number | null {
  if (!v || !/\d/.test(v)) return null;
  const surovo = v.match(/\d[\d.,\s]*\d|\d/)?.[0].replace(/\s+/g, "") ?? "";
  // Angleški zapis tisočic (1,250,000) — slovenski (1.250.000) pokrije stevilo().
  const n = /^\d{1,3}(?:,\d{3})+$/.test(surovo) ? Number(surovo.replace(/,/g, "")) : stevilo(surovo);
  if (n === null || !Number.isFinite(n) || n <= 0) return null;
  // Nadomestki "na povpraševanje" (999999, 9999999) niso cena.
  if (/^9{5,}$/.test(String(Math.round(n)))) return null;
  return n;
}

function letoIz(v: string | undefined): number | null {
  const m = v?.match(/\b(\d{4})\b/);
  if (!m) return null;
  const leto = Number(m[1]);
  return leto >= 1000 && leto <= new Date().getFullYear() + 5 ? leto : null;
}

/**
 * Regija vira -> slovenska statistična regija, SAMO kadar je nedvoumna.
 * "Štajerska" je podravska ali savinjska, "Dolenjska (e.g. Novo mesto,
 * Krško)" je dolenjska ali posavska (Podgorje pri Pišecah je v Brežicah) —
 * te ostanejo prazne; kraj je vedno zapisan in ga geokodiranje umesti samo.
 */
function regijaIz(sidro: string | null, kraj: string | null): string | null {
  const s = (sidro ?? "").toLowerCase();
  if (s.startsWith("gorenjska")) return "gorenjska";
  if (s.startsWith("n-primorska")) return "goriska";
  if (s.startsWith("s-primorska")) return "obalno-kraska";
  if (s.startsWith("ljubljana")) return kraj && /^ljubljana\b/i.test(kraj) ? "ljubljana-mesto" : null;
  if (s.startsWith("prekmurje") || s.startsWith("pomurje")) return "pomurska";
  if (s.startsWith("koroska")) return "koroska";
  return null;
}

/** Vrsta nastanitve -> podtip; ključi so iste vrste kot v parse.ts (nastanitevIz). */
const PODTIP: Record<string, string> = {
  hotel: "hotel",
  penzion: "penzion",
  "gostišče": "gostisce",
  hostel: "hostel",
  motel: "motel",
  "nastanitveni objekt": "nastanitveni_objekt",
};

const LEGA: Record<string, string> = { rural: "podeželje", city: "mesto", village: "vas", town: "mesto", suburban: "predmestje" };

const sklon = (n: number, ena: string, dve: string, tri: string, pet: string) =>
  n === 1 ? ena : n === 2 ? dve : n <= 4 ? tri : pet;

/**
 * Opis iz DEJSTEV, po slovensko — ne prevod ali povzetek besedila vira.
 * Nastanitev gre NA ZAČETEK: osrednji detektor (nastanitevIz) pri hišah
 * gleda samo prvih 150 znakov, kjer oglas pove, kaj prodaja.
 */
function opisIzDejstev(d: Dejstva): string {
  const l = d.lastnosti;
  const e = d.enote;
  const deli: (string | null)[] = [];
  if (e.nastanitev) {
    const sob = e.sob ?? e.enot;
    deli.push(`${e.nastanitev[0].toUpperCase()}${e.nastanitev.slice(1)} (po opisu vira)${sob ? `: ${sob} ${sklon(sob, "soba", "sobi", "sobe", "sob")}` : ""}`);
  }
  if (e.stanovanj) {
    deli.push(
      e.nastanitev
        ? `${e.stanovanj} ${sklon(e.stanovanj, "apartma", "apartmaja", "apartmaji", "apartmajev")} (po opisu vira)`
        : `Več enot: ${e.stanovanj} ${sklon(e.stanovanj, "stanovanje", "stanovanji", "stanovanja", "stanovanj")} (po opisu vira)`
    );
  }
  if (e.moznihEnot && !e.sob && !e.stanovanj && !e.enot) deli.push(`Možnost ureditve do ${e.moznihEnot} enot (po opisu vira)`);
  if (d.najem) deli.push("Najem (mesečna najemnina)");
  deli.push(l["Type"] ? `Vrsta pri viru: ${l["Type"]}` : null);
  const pov = povrsinaIz(l["Size"]);
  const zem = povrsinaIz(l["Size of land"]);
  deli.push(pov ? `${pov} m2` : null, zem ? `zemljišče ${zem} m2` : null);
  deli.push(l["Bedrooms"] ? `spalnic: ${l["Bedrooms"]}` : null);
  deli.push(l["Built"] ? `zgrajeno ${l["Built"]}` : null, l["Renovated"] ? `prenovljeno ${l["Renovated"]}` : null);
  deli.push(l["Area"] ? `lega: ${LEGA[l["Area"].toLowerCase()] ?? l["Area"]}` : null);
  deli.push(l["Energy level"] ? `energijski razred: ${l["Energy level"]}` : null);
  deli.push(d.zaObnovo ? "za obnovo" : null);
  deli.push(l["City"] ? `kraj: ${l["City"]}` : null, d.regijaVira ? `območje vira: ${d.regijaVira}` : null);
  deli.push(d.sifra ? `šifra ${d.sifra}` : null);
  return deli.filter(Boolean).join("; ");
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const d = (k.surovo ?? {}) as unknown as Dejstva;
  const l = d.lastnosti ?? {};
  const e = d.enote ?? { nastanitev: null, sob: null, stanovanj: null, enot: null, moznihEnot: null };
  const naslov = k.naslovVrstica ?? "";
  const tip = tipIz(l["Type"], naslov);
  const kraj = l["City"] ?? null;

  let povrsinaM2 = povrsinaIz(l["Size"]);
  let zemljisceM2 = povrsinaIz(l["Size of land"]);
  // Pri zemljišču je "Size" površina parcele, ne stavbe.
  if (tip === "posest" && zemljisceM2 === null && povrsinaM2 !== null) {
    zemljisceM2 = povrsinaM2;
    povrsinaM2 = null;
  }

  /**
   * ENOTE. Trditev iz opisa (10 sob hotela, 3 stanovanja) je stEnot. Spalnice
   * iz polja "Bedrooms" pri nastanitvenem objektu so samo OCENA: butični hotel
   * v Poljanah ima "Bedrooms: 7", opis pa pove pet sob za goste in apartma v
   * skednju — spalnice niso enote. Pri stanovanju ali navadni hiši enot ni.
   */
  const trditve = [e.sob, e.stanovanj, e.enot].filter((x): x is number => x !== null);
  const stEnot = tip !== "stanovanje" && trditve.length > 0 ? Math.max(...trditve) : null;
  const spalnic = stevilo(l["Bedrooms"]);
  const stEnotOcena =
    stEnot !== null || tip === "stanovanje"
      ? null
      : e.moznihEnot ?? (e.nastanitev && spalnic !== null && spalnic >= 2 ? spalnic : null);

  const posel = d.najem ? "oddaja" : "prodaja";
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip,
    podtip: e.nastanitev ? PODTIP[e.nastanitev] ?? null : null,
    posel,
    regija: regijaIz(d.regijaSidro ?? null, kraj),
    kraj,
    cenaEur: cenaIzVrednosti(k.cenaBesedilo),
    povrsinaM2,
    zemljisceM2,
    letoIzgradnje: letoIz(l["Built"]),
    letoAdaptacije: letoIz(l["Renovated"]),
    nadstropje: null,
    vecEnot: (stEnot ?? 0) >= 2,
    stEnot,
    stEnotOcena,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: d.zaObnovo === true,
    zaInvesticijo: e.nastanitev !== null || (stEnot ?? 0) >= 2 || /\binvestment\b/i.test(naslov),
    opis: k.opis,
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    slikaUrl: k.slika,
    stSlik: k.stSlik,
    raw: { kartica: d, rezina: r.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  omejitve: { zamikMs: ZAMIK_MS },
  crawlDelayS: null,
  // ~84 slovenskih prodajnih oglasov; zunaj razpona je nekaj narobe z branjem.
  pricakovanRazpon: [30, 400],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  /**
   * Stran = en oglas. ~84 oglasov pri 24 na dan (dva kroga, prelet vzame po
   * dve) je poln obhod v ~4 dneh. Proračun vira je nad tem za branje kazala
   * (en zahtevek na krog, ki ga glavna zanka ne šteje) in rezervo.
   */
  najvecStrani: 24,
  dnevnaMejaStrani: 24,
  dnevniProracunVira: 30,
  // Varovalka: če bi sitemap nenadoma naštel tisoč oglasov, je to napaka, ne trg.
  najvecStraniNaRezino: 150,
  /**
   * Kazalo je razvrščeno po lastmod, ki ga za vsak oglas pove vir sam — od
   * najnovejšega navzdol. Trditev je zato preverljiva ob vsakem branju: nov
   * ali spremenjen oglas (nova cena) je na vrhu in ga prelet ujame v istem dnevu.
   */
  razvrsceniPoNovosti: true,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (29. 9. 2026): ena skupina za *, prazen Disallow — vse poti so dovoljene, Crawl-delay in " +
    "Content-Signal nista navedena. Acceptable Use Policy (27. 5. 2022) o robotih, avtomatskem zajemu, " +
    "meta-iskanju ali zbirkah ne pove ničesar, vendar izrecno ne podeli licence za avtorske pravice — zato " +
    "hranimo samo dejstva (cena, m2, vrsta, kraj, leto, šifra, število sob kot številko) in povezavo, NE " +
    "angleških opisov in NE fotografij (slika le kot povezava na izvirnik, brez arhiva). Presoja in dva " +
    "neodvisna skeptika (pravni + tehnični) omejitve niso našli; beremo samo www.sloveniaestates.com " +
    "(ne novi-list.com, ki je ista namestitev), ne /wp-json/ in ne 'Printable details'. Pogoja: najmanj 8 s " +
    "razmika in zbirke ne objavljamo javno v celoti (sui generis pravica baze podatkov).",
  rezine: () => [{ oznaka: "kazalo" }],
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("sloveniaestates.com se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
