import type { NormaliziranOglas } from "../db.js";
import { cenaIz } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { goloBesedilo, prenesi } from "./http.js";

/**
 * immozentral.com — nemški portal, SAMO slovenski oglasi (/ausland/immobilien/slowenien).
 *
 * Zakaj ta vir: majhen je (Slovenija ima ~45–63 oglasov), a večina prve strani
 * so ZASEBNI prodajalci, ki oglašujejo samo nemškim kupcem ("Privatanbieter") —
 * teh oglasov na slovenskih portalih ni. Med hoteli sta dva z 10+ sobami
 * (Rogaška Slatina 64, Limbus 33), vendar od slovenskih agencij, ki jih
 * verjetno objavljajo tudi doma — tam gre za dvojnike, ne za nove najdbe.
 *
 * Pravna presoja (29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt: skupina za * prepoveduje samo mape s slikami (/bilder/,
 *     /images/ …) in /cgi-bin/. Seznami /ausland/immobilien/slowenien/* so
 *     dovoljeni, Crawl-delay ni naveden.
 *   - AGB (§1–8) o avtomatskem zajemu, robotih ali zbirkah ne pravijo nič.
 *     §2 prepoveduje prenos slik ("Bildmaterial ist lizenziert …") — zato
 *     slika_url ostane prazen, tudi hotlink ne (slike so na
 *     img.immozentral.com/bilder/, ki ga robots prepoveduje).
 *   - Podrobne strani /angebot/{id} imajo noindex,noarchive in so dosegljive
 *     samo prek POST obrazcev. Upravljavec jih očitno ne želi v indeksih, zato
 *     jih NE beremo (ni 2. faze, ni PDF arhiva) — hranimo samo povezavo.
 *   - Hranimo samo DEJSTVA s kartice (cena, vrsta, pošta/kraj, m², sobe,
 *     zemljišče, leto, stanje, vrsta ponudnika in ime agencije). Naslova in
 *     opisa, ki ju je napisal prodajalec, NE hranimo; zasebnih prodajalcev ne
 *     imenujemo (kartica jih tako ali tako ne pove).
 *
 * Tehnično: strežniško izrisan HTML (ColdFusion), 12 kartic na pogled. Pravo
 * listanje ("weitere Ergebnisse") je POST obrazec s poljem position=11 — tega
 * presoja ni pregledala, zato ga NE uporabljamo. Beremo samo prvo stran vsakega
 * pogleda, ki ga stran sama ponuja kot navadno GET povezavo (vrste objektov
 * b11/b21/b31/b41 in kategorije). Unija teh pogledov pokrije skoraj ves
 * katalog; kar ostane globlje v pogledu z več kot 12 zadetki (hiše), ostane
 * nevidno, dokler ga lastnik ne dovoli prebrati drugače.
 */

const VIR = "immozentral.com";
const OSNOVA = "https://www.immozentral.com";
const SLOVENIJA = "/ausland/immobilien/slowenien";

type RezinaIz = Rezina & { pot: string; tip: string | null };

/**
 * Vrstni red je prednost: dnevni proračun je ~6 strani, polni obhod traja dva
 * dni — zato najprej to, kar služi cilju (hoteli, poslovni objekti), nato
 * glavni pogled in hiše, zemljišča na koncu. Pogledi se prekrivajo; isti oglas
 * dobi v vsakem pogledu isto vrsto, ker jo beremo s KARTICE, ne iz rezine.
 */
const REZINE: RezinaIz[] = [
  { oznaka: "hoteli", pot: "hotels", tip: "poslovni_prostor" },
  { oznaka: "poslovni-prodaja", pot: "b41", tip: "poslovni_prostor" },
  { oznaka: "vse", pot: "", tip: null },
  { oznaka: "hise-prodaja", pot: "b11", tip: "hisa" },
  { oznaka: "enodruzinske-hise", pot: "einfamilienhaus", tip: "hisa" },
  { oznaka: "ob-morju-jezeru", pot: "am_meer", tip: null },
  { oznaka: "brez-provizije", pot: "provisionsfrei", tip: null },
  { oznaka: "stanovanja-prodaja", pot: "b21", tip: "stanovanje" },
  { oznaka: "zemljisca-prodaja", pot: "b31", tip: "posest" },
  { oznaka: "kmetijska-zemljisca", pot: "ackerland", tip: "posest" },
  { oznaka: "gradbena-zemljisca", pot: "baugrund", tip: "posest" },
];

/** En GET pogled = ena stran; `stran` se ne prevede v URL (glej opombo zgoraj). */
function seznamUrl(r: Rezina): string {
  const pot = (r as RezinaIz).pot;
  return `${OSNOVA}${SLOVENIJA}${pot ? `/${pot}` : ""}`;
}

async function preberiHttp(
  r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  // Druge strani ni (listanje je POST, ki ga ne uporabljamo) — brez zahtevka.
  if (stran > 1) return { kartice: [], zadnjaStran: 1, skupajZadetkov: null };
  return karticeIzHtml(await prenesi(seznamUrl(r), ua, { jezik: "de-DE,de;q=0.9,en;q=0.5" }), stran);
}

/**
 * Stran uporablja poimenovane entitete (&euro; &sup2; &uuml;), ki jih skupni
 * brezEntitet ne pozna; brez tega cena ni "73.000 €" in cenaIz je ne najde.
 */
const ENTITETE: Record<string, string> = {
  euro: "€", sup2: "²", sup3: "³", uuml: "ü", Uuml: "Ü", auml: "ä", Auml: "Ä", ouml: "ö", Ouml: "Ö",
  szlig: "ß", eacute: "é", egrave: "è", scaron: "š", Scaron: "Š", ndash: "–", mdash: "—", bdquo: "„",
  ldquo: "“", rdquo: "”", reg: "®",
};
const besedilo = (html: string): string =>
  goloBesedilo(html.replace(/&([a-z]+\d?);/gi, (m, ime: string) => ENTITETE[ime] ?? m));

/** "11.908" -> 11908, "3.0" -> 3, "274" -> 274. Nemški zapis: pika loči tisočice. */
function st(s: string | undefined | null): number | null {
  if (!s) return null;
  const t = s.trim();
  const n = /^\d+[.,]\d$/.test(t) ? Number(t.replace(",", ".")) : Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Kar kartica pove — samo dejstva, brez naslova in opisa prodajalca. */
export type KarticaIz = {
  id: string;
  /** Kategorija vira z gumba kartice: "Haus", "Grundstück", "Gewerbeimmobilie", "Wohnung". */
  kategorija: string | null;
  /** Vrstica, ki jo sestavi portal sam: "Hotel zum Kauf, mit Grundstück: 3.896 m², teilsaniert". */
  vrstica: string | null;
  cena: string | null;
  lokacija: string | null;
  posta: string | null;
  kraj: string | null;
  wohnflaeche: number | null;
  zimmer: number | null;
  grundstueck: number | null;
  schlafzimmer: number | null;
  badezimmer: number | null;
  baujahr: number | null;
  /** "makler" | "privat" — kdo oglašuje. Ime samo pri agenciji. */
  ponudnik: "makler" | "privat" | null;
  agencija: string | null;
  /** Oznake vira: na sliki ("AKT") in ob kraju ("von privat", "provisionsfrei"). */
  oznake: string[];
  provisionsfrei: boolean;
  /**
   * Ali besedilo prodajalca pravi "zu vermieten". Hranimo SAMO to zastavico,
   * besedila ne. Povod: 3163966 je "Haus zum Kauf" za 1.150 € — prodajalec je
   * najem vpisal kot prodajo, kar pove šele njegov opis ("zuvermieten").
   */
  najemVBesedilu: boolean;
};

/** Imena, ki niso ime agencije (vir jih izpiše, ko ga ponudnik ne vpiše). */
const NI_IME = /^(?:0|-|gewerbliche?r?\s+(?:vermittler|anbieter)|immobilienmakler)$/i;

function karticaIz(id: string, s: string): KarticaIz {
  const najdi = (re: RegExp) => s.match(re)?.[1] ?? null;
  const beri = (re: RegExp) => {
    const m = najdi(re);
    return m ? besedilo(m) || null : null;
  };
  const lok = beri(/fa-map-marker"><\/i>([^<]*)</);
  const pk = lok?.match(/^(\d{4})\s+(.+?),\s*Slowenien$/i);
  const ponudnik = beri(/fa-user-circle"[^>]*><\/i>([\s\S]*?)(?:<img|<\/div>)/) ?? "";
  const makler = ponudnik.match(/^Immobilienmakler\s+(.+?)\s+in$/i)?.[1]?.trim() ?? null;
  const leto = st(najdi(/title="Baujahr"><\/i>\s*(\d{4})/));
  const oznake = [
    ...s.matchAll(/<span class='[a-z]+'>([^<]{1,30})<\/span>|<div class='[a-z]+'[^>]*title='([^']{1,40})'/g),
  ].map((m) => besedilo(m[1] ?? m[2] ?? "")).filter(Boolean);
  // Besedilo prodajalca preberemo samo za to eno zastavico in ga zavržemo.
  const uvodProdajalca = najdi(/<div style="margin-top:8px;font-size:14px;color:gray;">([\s\S]*?)<\/div>/) ?? "";
  return {
    id,
    kategorija: beri(/class="formbutton3"\s+title="([^"]*)"/),
    vrstica: beri(/class="formbutton3"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/),
    cena: beri(/class="preisanzeige"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/),
    lokacija: lok,
    posta: pk?.[1] ?? null,
    kraj: pk?.[2]?.trim() ?? (lok ? lok.replace(/,\s*Slowenien$/i, "").trim() || null : null),
    wohnflaeche: st(najdi(/title="Wohnflaeche"><\/i>\s*([\d.,]+)\s*m/)),
    zimmer: st(najdi(/<\/div>\s*([\d.,]+)\s*Zi\b/)),
    grundstueck: st(najdi(/title="Grundst(?:ü|&uuml;)ck"><\/i>\s*([\d.,]+)\s*m/)),
    schlafzimmer: st(najdi(/title="Schlafzimmer"><\/i>\s*([\d.,]+)/)),
    badezimmer: st(najdi(/title="Badezimmer"><\/i>\s*([\d.,]+)/)),
    baujahr: leto !== null && leto >= 1500 && leto <= new Date().getFullYear() + 3 ? leto : null,
    ponudnik: /^Privatanbieter/i.test(ponudnik) ? "privat" : /^Immobilienmakler/i.test(ponudnik) ? "makler" : null,
    agencija: makler && !NI_IME.test(makler) ? makler : null,
    oznake,
    provisionsfrei: oznake.some((o) => /provisionsfrei/i.test(o)),
    najemVBesedilu: /\bzu\s*vermieten\b|\bzur\s+miete\b/i.test(besedilo(uvodProdajalca)),
  };
}

/**
 * Število zadetkov, kakor ga pove VIR SAM: v stranskem meniju stoji povezava
 * na ta pogled s številom ("Haus Kauf (28)", "Hotels (3)"). Pogled prepoznamo
 * po skritem polju requestfrom, ki ga stran nosi v vsakem obrazcu.
 *
 * Kadar števila ni, a je stran izrisana v celoti (meni vrst objektov) in nima
 * niti glave "Treffer" niti kartic, je pogled prazen — to ni blokada. Tako
 * izpraznjena kategorija hotelov ne sproži 24-urnega hlajenja celega vira.
 */
function steviloZadetkov(html: string, kartic: number): number | null {
  const pot = html.match(/name="requestfrom" value="([^"]+)"/)?.[1];
  if (pot) {
    const re = new RegExp(`href="${pot.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*>(?:(?!</a>)[\\s\\S]){0,160}?\\((\\d+)\\)`);
    const m = html.match(re);
    if (m) return Number(m[1]);
  }
  const treffer = html.match(/Treffer\s+\d+\s*-\s*(\d+)/);
  if (treffer) return Number(treffer[1]);
  if (kartic === 0 && /id="objektauswahl"/.test(html)) return 0;
  return null;
}

/** Čisto razčlenjevanje strani — brez omrežja, zato ga je mogoče preizkusiti na shranjeni strani. */
export function karticeIzHtml(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  // Pod naslovom "Immobilien, die Sie auch interessieren könnten (weltweit)"
  // so oglasi iz Grčije, Madžarske, Poljske … (tudi najem "350 € KM"). Tu
  // odrežemo; filter ", Slowenien" spodaj je druga varovalka.
  const konec = html.search(/die Sie auch interessieren k/i);
  const lastni = konec >= 0 ? html.slice(0, konec) : html;

  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  // Vsaka kartica je <ul class="zeile" id="zeile{id}">. Delimo na VSAKEM
  // <ul class="zeile" (tudi na menijih "preisauswahl", "objektauswahl"), da
  // zadnja kartica ne sega v stranski meni in iz njega ne pobere polja.
  const deli = lastni.split(/<ul class="zeile"\s+/);
  for (const del of deli.slice(1)) {
    const id = del.match(/^id="zeile(\d+)"/)?.[1];
    if (!id || videni.has(id)) continue;
    const k = karticaIz(id, del);
    if (!k.lokacija || !/Slowenien$/i.test(k.lokacija)) continue;
    videni.add(id);
    kartice.push({
      url: `${OSNOVA}/angebot/${id}`,
      virId: id,
      lokacija: k.lokacija,
      naslovVrstica: k.vrstica,
      opis: opisIz(k),
      cenaBesedilo: k.cena,
      telefon: null,
      agencija: k.agencija,
      slika: null, // AGB §2 in robots.txt (/bilder/) — slik ne prenašamo in ne povezujemo
      stSlik: null,
      surovo: k as unknown as Record<string, unknown>,
    });
  }
  // En GET pogled je ena stran: zadnja stran je ta, ki smo jo prebrali.
  return { kartice, zadnjaStran: stran, skupajZadetkov: steviloZadetkov(html, kartice.length) };
}

/**
 * Vrsta objekta iz PRVE besede vrstice ("Wald- und Wiesenland zum Kauf, mit
 * Grundstück: …"). Cele vrstice ne smemo gledati: "mit Grundstück" stoji tudi
 * pri vsaki hiši. Vrstni red je prednost — "Ferienhaus" pred "Haus",
 * "Apartmenthaus" pred "Wohnung".
 */
const VRSTE: [RegExp, string, string | null][] = [
  [/hotel/i, "poslovni_prostor", "hotel"],
  [/pension|gästehaus|fremdenzimmer/i, "poslovni_prostor", "penzion"],
  [/gasthaus|gasthof/i, "poslovni_prostor", "gostisce"],
  [/hostel/i, "poslovni_prostor", "hostel"],
  [/motel/i, "poslovni_prostor", "motel"],
  [/apartmenthaus|appartementhaus|ferienanlage/i, "poslovni_prostor", "apartmajska_hisa"],
  [/restaurant|gastronomie|café|cafe|kneipe|\bbar\b/i, "poslovni_prostor", null],
  [/ferienhaus|ferienwohnung|wochenendhaus|ferienimmobilie/i, "pocitniski_objekt", null],
  [/garage|stellplatz|parkplatz/i, "garaza", null],
  [/wohnung|apartment|appartement|penthouse|maisonette|loft/i, "stanovanje", null],
  [/grundst|bauland|baugrund|acker|wald|wiese|weinberg|landwirtschaft|weide/i, "posest", null],
  [/gewerbe|lager|halle|büro|praxis|laden|geschäft|einkauf|werkstatt|industrie|produktion|bürogebäude/i, "poslovni_prostor", null],
  [/haus|villa|bungalow|chalet|hof\b|schloss|burg/i, "hisa", null],
];

/** Kategorija z gumba kartice — rezerva, kadar prva beseda ni v seznamu. */
const KATEGORIJE: Record<string, string> = {
  haus: "hisa",
  wohnung: "stanovanje",
  "grundstück": "posest",
  gewerbeimmobilie: "poslovni_prostor",
};

/** Nastanitveni objekti: njihove sobe ("64.0 Zi") so enote za oddajo. */
const NASTANITVE = new Set(["hotel", "penzion", "hostel", "motel"]);

function vrstaIz(k: KarticaIz, rez?: RezinaIz): { tip: string | null; podtip: string | null; beseda: string | null } {
  const beseda = k.vrstica?.split(/\s+zu[mr]\s+|,/i)[0]?.trim() || null;
  if (beseda) {
    for (const [re, tip, podtip] of VRSTE) if (re.test(beseda)) return { tip, podtip, beseda };
  }
  const izKategorije = KATEGORIJE[(k.kategorija ?? "").toLowerCase()];
  return { tip: izKategorije ?? rez?.tip ?? null, podtip: null, beseda };
}

/**
 * Najem: kar pove portal sam ("zur Miete", "350 € KM") — ali pa se ujemata
 * DVA neodvisna znaka: prodajalec v besedilu piše "zu vermieten" IN cena je
 * velikosti najemnine. En sam znak ne zadošča: prodajni oglas zna reči
 * "ideal zum Vermieten", cena 1.150 € pa je pri zemljišču lahko prava.
 */
const NAJEMNINA_DO = 10_000;
function jeNajem(k: KarticaIz): boolean {
  if (/\bzur\s+(?:miete|pacht)\b|\bzu\s+vermieten\b/i.test(k.vrstica ?? "")) return true;
  if (/\b(?:KM|WM|mtl\.?|Miete)\b/.test(k.cena ?? "")) return true;
  const cena = cenaEurIz(k.cena);
  return k.najemVBesedilu && cena !== null && cena < NAJEMNINA_DO;
}

/**
 * Bivalna površina, kakor jo je prodajalec vpisal — razen kadar je očitno
 * napačno polje: 3133124 ima "220.000 m²" pri ceni 220.000 € (cena v polju
 * površine). Taka številka bi popačila €/m² statistiko; v raw ostane.
 */
function povrsinaIz(k: KarticaIz): number | null {
  const m2 = k.wohnflaeche;
  if (m2 === null) return null;
  if (m2 > 100_000 || m2 === cenaEurIz(k.cena)) return null;
  return m2;
}

/**
 * Nekateri oglasi namesto kraja navedejo pokrajino ("8340 Dolenjska"). To je
 * regija, ki jo vir JASNO pove — kraj pa ni. Samo imena, ki se v našo shemo
 * preslikajo enolično; "Štajerska" ali "Primorska" pokrivata po dve regiji in
 * ostaneta kraj brez regije.
 */
const POKRAJINE: Record<string, string> = {
  dolenjska: "dolenjska", "jugovzhodna slovenija": "dolenjska", unterkrain: "dolenjska",
  gorenjska: "gorenjska", oberkrain: "gorenjska",
  notranjska: "notranjska", "primorsko-notranjska": "notranjska", innerkrain: "notranjska",
  koroska: "koroska", pomurje: "pomurska", pomurska: "pomurska", prekmurje: "pomurska",
  posavje: "posavska", posavska: "posavska", zasavje: "zasavska", zasavska: "zasavska",
  savinjska: "savinjska", podravska: "podravska", podravje: "podravska",
  goriska: "goriska", "obalno-kraska": "obalno-kraska", "slovenska istra": "obalno-kraska",
};
const brezSumnikov = (s: string) =>
  s.toLowerCase().replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").trim();

/** Stanje z vrstice, prevedeno — da ga iskalnik in model bereta po slovensko. */
const STANJA: [RegExp, string][] = [
  [/renovierungsbedürftig|sanierungsbedürftig|modernisierungsbedürftig/i, "potrebno obnove"],
  [/abrissreif|baufällig/i, "za rušenje"],
  [/teilsaniert|teilrenoviert/i, "delno obnovljeno"],
  [/saniert|renoviert|modernisiert/i, "obnovljeno"],
  [/neuwertig|erstbezug|neubau/i, "kot novo"],
  [/gepflegt/i, "vzdrževano"],
];
const OPREMA: [RegExp, string][] = [
  [/swimming-?pool|\bpool\b/i, "bazen"],
  [/garten/i, "vrt"],
  [/balkon|terrasse/i, "balkon/terasa"],
  [/garage/i, "garaža"],
  [/keller/i, "klet"],
];

/**
 * Opis sestavimo iz DEJSTEV kartice (po slovensko), ne iz besedila
 * prodajalca: tako ga bere centralni detektor nastanitve ("hotel … 64 sob")
 * in iskalnik, hkrati pa ne objavljamo tujega opisa (glej pravno opombo).
 */
function opisIz(k: KarticaIz): string {
  const v = vrstaIz(k);
  const stanje = STANJA.find(([re]) => re.test(k.vrstica ?? ""))?.[1] ?? null;
  const oprema = OPREMA.filter(([re]) => re.test(k.vrstica ?? "")).map(([, s]) => s);
  const enote = enoteIz(k, v.podtip, v.beseda);
  const m2 = povrsinaIz(k);
  return [
    k.vrstica,
    jeNajem(k) && !/zur\s+(?:miete|pacht)/i.test(k.vrstica ?? "") ? "po navedbah prodajalca v najem" : null,
    v.podtip && NASTANITVE.has(v.podtip) ? `vrsta objekta: ${v.podtip}` : null,
    v.podtip === "gostisce" ? "vrsta objekta: gostišče" : null,
    v.podtip === "apartmajska_hisa" ? "vrsta objekta: apartmajska hiša" : null,
    enote.dvostanovanjska ? "dvostanovanjska hiša" : null,
    enote.vecstanovanjska ? "večstanovanjska hiša" : null,
    k.lokacija,
    m2 ? `${m2} m2 bivalne površine` : null,
    // Sobe hiše niso enote; pri hotelu pa so — detektor nastanitve to loči sam.
    k.zimmer ? `${k.zimmer} sob` : null,
    k.schlafzimmer ? `${k.schlafzimmer} spalnic` : null,
    k.badezimmer ? `${k.badezimmer} kopalnic` : null,
    k.grundstueck ? `zemljišče ${k.grundstueck} m2` : null,
    k.baujahr ? `leto izgradnje ${k.baujahr}` : null,
    stanje ? `stanje: ${stanje}` : null,
    oprema.length > 0 ? `oprema: ${oprema.join(", ")}` : null,
    k.provisionsfrei ? "brez provizije" : null,
    k.ponudnik === "privat" ? "ponudnik: zasebni prodajalec" : k.ponudnik === "makler" ? `ponudnik: agencija${k.agencija ? ` ${k.agencija}` : ""}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Enote, ki jih vir TRDI. Pri hotelu so to sobe (strukturirano polje "Zi");
 * "Zweifamilienhaus" pove dve stanovanji z imenom samim. Sobe družinske hiše
 * ("5.0 Zi", tudi "20.0 Zi") niso enote — o tem kartica ne pove ničesar.
 */
function enoteIz(
  k: KarticaIz,
  podtip: string | null,
  beseda: string | null
): { stEnot: number | null; dvostanovanjska: boolean; vecstanovanjska: boolean } {
  const b = beseda ?? "";
  if (podtip && NASTANITVE.has(podtip) && k.zimmer !== null && k.zimmer >= 2) {
    return { stEnot: Math.round(k.zimmer), dvostanovanjska: false, vecstanovanjska: false };
  }
  if (/zweifamilienhaus/i.test(b)) return { stEnot: 2, dvostanovanjska: true, vecstanovanjska: false };
  if (/dreifamilienhaus/i.test(b)) return { stEnot: 3, dvostanovanjska: false, vecstanovanjska: true };
  if (/mehrfamilienhaus/i.test(b)) return { stEnot: null, dvostanovanjska: false, vecstanovanjska: true };
  return { stEnot: null, dvostanovanjska: false, vecstanovanjska: false };
}

/** "auf Anfrage" in nadomestki (9.999.999, 1 €) niso cena. */
function cenaEurIz(besedilo: string | null): number | null {
  if (!besedilo || /anfrage/i.test(besedilo)) return null;
  const n = cenaIz(besedilo);
  if (n === null || n <= 1) return null;
  if (/^(\d)\1{5,}$/.test(String(n))) return null;
  return n;
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const rez = r as RezinaIz;
  const s = (k.surovo ?? {}) as KarticaIz;
  const v = vrstaIz(s, rez);
  const enote = enoteIz(s, v.podtip, v.beseda);
  const jeNastanitev = v.podtip !== null && (NASTANITVE.has(v.podtip) || v.podtip === "gostisce" || v.podtip === "apartmajska_hisa");
  const vrstica = s.vrstica ?? "";
  // Vir pove pošto in kraj, statistične regije ne — razen kadar namesto kraja
  // stoji pokrajina (glej POKRAJINE).
  const pokrajina = s.kraj ? POKRAJINE[brezSumnikov(s.kraj)] ?? null : null;
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip: v.tip,
    podtip: v.podtip,
    posel: jeNajem(s) ? "oddaja" : "prodaja",
    regija: pokrajina,
    kraj: pokrajina ? null : s.kraj ?? null,
    cenaEur: cenaEurIz(k.cenaBesedilo),
    // Pri zemljišču portal "Wohnfläche" ne izpolni; če bi jo, ni bivalna.
    povrsinaM2: v.tip === "posest" ? null : povrsinaIz(s),
    zemljisceM2: s.grundstueck ?? null,
    letoIzgradnje: s.baujahr ?? null,
    letoAdaptacije: null,
    nadstropje: null,
    vecEnot: (enote.stEnot !== null && enote.stEnot >= 2) || enote.vecstanovanjska,
    stEnot: enote.stEnot,
    stEnotOcena: null,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: /renovierungsbedürftig|sanierungsbedürftig|modernisierungsbedürftig|abrissreif|baufällig/i.test(vrstica),
    zaInvesticijo: jeNastanitev || /vermietet|rendite/i.test(vrstica),
    opis: k.opis,
    prodajalec: null, // zasebnih prodajalcev ne imenujemo (presoja)
    agencija: k.agencija,
    telefon: null,
    slikaUrl: null,
    stSlik: null,
    raw: { kartica: s, rezina: rez.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  // Crawl-delay ni naveden; 8 s je naš privzeti razmik za tuje vire.
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  pricakovanRazpon: [20, 400],
  // Pogled pokaže samo prvih 12 oglasov; ostalo je za POST obrazcem, ki ga ne
  // uporabljamo. Oglas, ki ga ne vidimo, zato NI izginil — ne sklepamo.
  izginotjaZanesljiva: false,
  slikePolitika: "referenca",
  dovoljenArhivSlik: false, // AGB §2 (slike) in noarchive na podrobnih straneh
  svezKontekstNaStran: false,
  // Presoja: "največ enkrat na dan, ~6 zahtevkov". 11 pogledov = polni obhod v dveh dneh.
  najvecStrani: 6,
  najvecStraniNaRezino: 1,
  dnevnaMejaStrani: 6,
  dnevniProracunVira: 8,
  // Prva stran ni razvrščena po ID-ju ali datumu (3710287, 3781264, 3725623,
  // 3437185 …), datuma objave kartica nima — razvrstitve ne moremo dokazati.
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (29. 9. 2026): skupina za * prepoveduje samo mape s slikami (/bilder/, /images/ …) in " +
    "/cgi-bin/; seznami /ausland/immobilien/slowenien/* so dovoljeni, Crawl-delay ni naveden. AGB (§1–8) " +
    "ne omenjajo avtomatskega zajema, robotov ali zbirk; §2 prepoveduje prenos slik, zato slik ne " +
    "prenašamo in ne povezujemo. Podrobne strani so noindex,noarchive — ne beremo jih in ne arhiviramo, " +
    "hranimo samo dejstva s kartice in povezavo, brez opisa prodajalca in brez imen zasebnikov. " +
    "Preverjeno s presojo in dvema neodvisnima skeptikoma (pravni + tehnični), oba nista našla omejitve; " +
    "pogoj je nizka pogostost (~6 strani na dan).",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("immozentral.com se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
