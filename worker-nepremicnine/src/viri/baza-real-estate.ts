import type { NormaliziranOglas } from "../db.js";
import { cenaIz, izOpisa, stevilo } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, goloBesedilo, prenesi } from "./http.js";

/**
 * bazarealestate.com — BAZA agencija d.o.o. (Ljubljana, Maribor, obala).
 *
 * Zakaj ta vir: BAZA je IZVOR velikega dela agencijskih oglasov, ki jih potem
 * povzemajo portali — v vzorcu kvadrat.si (15. 9. 2026) je bila vir za 7 od 12
 * oglasov. Pri izvoru oglas vidimo prej in z izvirno ceno, ne iz druge roke.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt (Yoast): ena skupina za *, prazen Disallow — dovoljeno je vse;
 *     Crawl-delay in Content-Signal nista navedena, strani nosijo meta robots
 *     "index, follow", /.well-known/tdmrep.json je 404.
 *   - edini pravni besedili sta PDF-ja: "Splošni pogoji poslovanja"
 *     (12. 2. 2024) urejajo samo razmerje agencija–naročitelj, "Politika
 *     zasebnosti" pa osebne podatke obiskovalcev. O rabi spletišča, robotih,
 *     zbirkah ali ponovni rabi ne govorita; spletnih pogojev uporabe ni.
 *   - POGOJI: noga pravi "© BAZA agencija d.o.o.", zato hranimo samo dejstva
 *     (vrsta, kraj, cena, m², ID, povezava nazaj). Fotografij ne kopiramo in
 *     arhiva slik ni — slika_url je le povezava na njihov strežnik (robots.txt
 *     gostitelja slik, bazarealestate.com, jo dovoljuje). Imen, e-pošte in
 *     telefonov agentov ne beremo. Obrazcev (Turnstile, reCAPTCHA), /wp-json
 *     in admin-ajax.php se ne dotikamo; bazarealestate.si in testiramo.xyz
 *     (okrasne datoteke teme) ne kličemo.
 *
 * Tehnično: WordPress + tema Resideo, strežniško izrisan seznam
 * /si/ponudba/[page/N/]?sort=newest&search_status=S&cntr=D&cntr_comparison=equal,
 * 30 kartic na stran. Vse spodaj je izmerjeno 29. 9. 2026 na straneh, ki jih
 * dobi vsak obiskovalec (šest zahtevkov, 10 s razmika):
 *   - filter države DELUJE, čeprav ima Slovenija vrednost 0 (PHP bi jo lahko
 *     zamenjal za "brez filtra"): prodaja brez filtra 1316 zadetkov,
 *     Slovenija 1215, Hrvaška 67 — hrvaški kartici z vrha nefiltrirane strani
 *     (Privlaka, Sv. Petar na Moru) v slovenskem seznamu nista več;
 *   - oddaja Slovenija 649; stran 2 ohrani filter ("31 - 60 of 1215") in se s
 *     prvo ne prekriva; zadnja stran (22) ima 19 kartic ("631 - 649 of 649").
 *
 * ZAKAJ REZINE PO DRŽAVI IN NE PO REGIJI. Filter regije (podroje) tudi deluje
 * (Podravska: 139), a kartica, ki bi ji regija manjkala, bi tiho izpadla iz
 * vseh štirinajstih rezin — števila, ki bi to razkrilo, vir ne pove. Država
 * ima vir-sam-pove število (1215), regijo pa oglasu tako ali tako pripiše
 * šifrant krajev (kot pri siol in bolha).
 */

const VIR = "bazarealestate.com";
const OSNOVA = "https://bazarealestate.com";
/** Tema izriše 30 kartic na stran (izmerjeno; "1 - 30 of 1215 Results"). */
const NA_STRAN = 30;

type RezinaBaza = Rezina & {
  posel: "prodaja" | "oddaja";
  /** search_status vira: 33 = Prodaja, 34 = Oddaja. */
  status: 33 | 34;
  /** cntr vira: 0 = Slovenija, 1 = Hrvaška. */
  drzava: 0 | 1;
};

/**
 * Slovenija je prednost; hrvaško prodajo beremo, ker je majhna (67, tri
 * strani) in skoraj vsa na obali (Umag, Novigrad, Pula, Medulin, Zadar) —
 * tam so apartmajske hiše, ki jih uporabnik išče. Hrvaške oddaje ne beremo:
 * najem na Hrvaškem cilju ne služi, viru pa pomeni zahtevke.
 *
 * Vrstni red je vrstni red rotacije: najprej slovenska prodaja.
 */
const REZINE: RezinaBaza[] = [
  { oznaka: "prodaja/slovenija", posel: "prodaja", status: 33, drzava: 0 },
  { oznaka: "prodaja/hrvaska", posel: "prodaja", status: 33, drzava: 1 },
  { oznaka: "oddaja/slovenija", posel: "oddaja", status: 34, drzava: 0 },
];

function seznamUrl(r: Rezina, stran: number): string {
  const rez = r as RezinaBaza;
  const poizvedba = `?sort=newest&search_status=${rez.status}&cntr=${rez.drzava}&cntr_comparison=equal`;
  return stran <= 1 ? `${OSNOVA}/si/ponudba/${poizvedba}` : `${OSNOVA}/si/ponudba/page/${stran}/${poizvedba}`;
}

/** Kar o kartici hranimo v raw — samo dejstva, brez poti do slik. */
type SurovoBaza = {
  id: string;
  naslov: string;
  /** Del naslova pred prvo vejico: "3-sobno stanovanje", "Hiša dvojček". */
  vrsta: string;
  /** Del naslova za prvo vejico, kakor ga piše vir: "Ljubljana Zalog". */
  lokacija: string | null;
  /** "220.000€" — brez enote. */
  cena: string | null;
  /** Kar stoji za ceno: "", "+ DDV", "/ mesec", "/ m2 / mesec", "/ m2". */
  cenaEnota: string | null;
  /** Glavna velikost s kartice: "1325,00 m2". */
  povrsina: string | null;
  izpostavljeno: boolean;
  /** Prekrivna oznaka teme, ki NI "prodano/oddano" (npr. morebitno "znižano"). */
  oznakaVira: string | null;
  stSlik: number;
};

/**
 * PRODANO, ODDANO, V MIROVANJU. Tema jih ne izloči iz seznama, ampak čez
 * fotografije položi prosojno sliko (div.overlayw > img ".../PRODANO-768x511.png").
 * Starejše oddaje imajo "ODDANO" namesto tega vžgano v naslovno fotografijo
 * ("Britof-ODDANO-Andrej-si-800x600.jpg"). Na zadnji strani oddaje je bilo
 * takih 14 od 19 kartic, na prvi hrvaški strani 12 od 30.
 *
 * Takih kartic NE vrnemo: niso ponudba, shraniOglase pa zna zapisati samo
 * "aktiven". Oglas, ki je bil pri nas aktiven in je med tem prodan, zato ob
 * koncu kroga pravilno postane "izginil".
 */
const NEAKTIVNA_OZNAKA = /prodan|oddan|mirovanj|rezerviran|\bsold\b|\brented\b/i;
const VZGANA_OZNAKA = /(?:^|[-_])(?:oddano|prodano)(?=[-_.])/i;

function imeDatoteke(url: string): string {
  return decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
}

async function preberiHttp(
  r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  try {
    return karticeIzHtml(await prenesi(seznamUrl(r, stran), ua), stran);
  } catch (e) {
    // WordPress za stranjo čez konec seznama vrne 404. To ni napaka vira,
    // ampak konec rezine (kazalec rotacije je lahko ostal na strani, ki je
    // medtem odpadla, ker je bilo oglasov manj).
    if (stran > 1 && /HTTP 404/.test(String(e))) {
      return { kartice: [], zadnjaStran: stran - 1, skupajZadetkov: null };
    }
    throw e;
  }
}

/** Čisto razčlenjevanje strani — brez omrežja, zato ga je mogoče preizkusiti na shranjeni strani. */
export function karticeIzHtml(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null; neaktivnih: number } {
  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  let neaktivnih = 0;

  // Kartica je <a href="…/si/nepremicnine/<slug>/" class="pxp-results-card …"
  // data-prop="ID"> … </a>; v njej ni drugih povezav (puščici vrtiljaka sta
  // <span>), zato se kartica konča s prvim </a>.
  for (const m of html.matchAll(/<a\b[^>]*\bclass="pxp-results-card\b[^"]*"[^>]*>/g)) {
    const oznaka = m[0];
    const zacetek = m.index ?? 0;
    const konec = html.indexOf("</a>", zacetek);
    const kos = html.slice(zacetek, konec > zacetek ? konec : undefined);

    const href = oznaka.match(/\bhref="([^"]+)"/)?.[1];
    const id = oznaka.match(/\bdata-prop="(\d+)"/)?.[1];
    if (!href || !id || videni.has(id)) continue;
    videni.add(id);

    const naslov = brezEntitet(kos.match(/pxp-results-card-1-details-title">([^<]*)</)?.[1] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!naslov) continue;

    const slike = [...kos.matchAll(/<img\b[^>]*\bclass="d-block w-100"[^>]*\bsrc="([^"]+)"/g)].map((s) => s[1]);
    const prekrivna = kos.match(/class="overlayw"[^>]*>\s*<img\b[^>]*\bsrc="([^"]+)"/)?.[1] ?? null;
    const prekrivnaOznaka = prekrivna
      ? imeDatoteke(prekrivna)
          .replace(/(?:-\d+x\d+)?\.(?:png|jpe?g|webp|gif)$/i, "")
          .replace(/[-_]+/g, " ")
          .trim()
      : null;
    if ((prekrivnaOznaka && NEAKTIVNA_OZNAKA.test(prekrivnaOznaka)) || (slike[0] && VZGANA_OZNAKA.test(imeDatoteke(slike[0])))) {
      neaktivnih += 1;
      continue;
    }

    // Cena: "293.512,01€ <span>+ DDV</span>" — enota je v <span>.
    const cenaHtml = kos.match(/pxp-results-card-1-details-price">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const cena = goloBesedilo(cenaHtml.split(/<span\b/)[0]) || null;
    const cenaEnota = goloBesedilo(cenaHtml.match(/<span\b[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "") || null;
    const povrsina = goloBesedilo(kos.match(/pxp-results-card-1-features">([\s\S]*?)<\/div>/)?.[1] ?? "") || null;

    const vejica = naslov.search(/,\s/); // "3,5-sobno" ima vejico BREZ presledka
    const vrsta = (vejica >= 0 ? naslov.slice(0, vejica) : naslov).trim();
    const lokacija = vejica >= 0 ? naslov.slice(vejica + 1).trim() || null : null;

    // Slika samo kot povezava in samo z gostitelja, ki ga robots.txt dovoli.
    const prva = slike[0] ?? null;
    const slika = prva && /^https:\/\/bazarealestate\.com\/wp-content\/uploads\//.test(prva) ? prva : null;

    const surovo: SurovoBaza = {
      id,
      naslov,
      vrsta,
      lokacija,
      cena,
      cenaEnota,
      povrsina,
      izpostavljeno: /\bpxp-is-featured\b/.test(oznaka),
      oznakaVira: prekrivnaOznaka,
      stSlik: slike.length,
    };
    kartice.push({
      url: href.startsWith("http") ? href : `${OSNOVA}${href}`,
      virId: id,
      lokacija,
      naslovVrstica: naslov,
      // Besedilo kartice, kakor ga vidi obiskovalec — iz njega bere tudi
      // detektor nastanitve ("Apartmajska hiša, Sv. Petar na Moru").
      opis: [
        naslov,
        povrsina,
        cena ? `${cena}${cenaEnota ? ` ${cenaEnota}` : ""}` : null,
        prekrivnaOznaka ? `oznaka vira: ${prekrivnaOznaka}` : null,
      ]
        .filter(Boolean)
        .join(". "),
      cenaBesedilo: cena ? `${cena}${cenaEnota ? ` ${cenaEnota}` : ""}` : null,
      telefon: null, // telefoni so agentovi (osebni podatki) — ne beremo jih
      agencija: "BAZA agencija d.o.o. (bazarealestate.com)",
      slika,
      stSlik: slike.length > 0 ? slike.length : null,
      surovo,
    });
  }

  // "1 - 30 of 1215 Results": število zadetkov po viru (vključno s prodanimi).
  const skupaj = html.match(/(\d[\d.,]*)\s+Results\b/)?.[1];
  const skupajZadetkov = skupaj !== undefined ? Number(skupaj.replace(/\D/g, "")) : null;

  // Oštevilčenje: največja številka strani med povezavami (na prvi strani je
  // med njimi tudi zadnja, "»»"); brez povezav je stran ena sama.
  const strani = [...html.matchAll(/class="page-link" href="[^"]*\/ponudba\/page\/(\d+)\//g)].map((s) => Number(s[1]));
  const zadnjaStran =
    strani.length > 0
      ? Math.max(stran, ...strani)
      : skupajZadetkov !== null
        ? Math.max(stran, Math.ceil(skupajZadetkov / NA_STRAN), 1)
        : kartice.length + neaktivnih > 0
          ? stran
          : null;

  return { kartice, zadnjaStran, skupajZadetkov, neaktivnih };
}

/**
 * Vrsta iz prvega dela naslova. Vir pozna samo štiri vrste (Stanovanje, Hiša,
 * Poslovni prostor, Zemljišče), naslov pa pove več ("Vikend", "Garsonjera",
 * "Enota v dvostanovanjski hiši"). Vrstni red je prednost: "Kmetijsko
 * zemljišče" je posest in ne kmetija, "Apartmajska hiša" je hiša in ne
 * apartma, "Enota v dvostanovanjski hiši" pa je ENO stanovanje.
 */
function tipIzVrste(vrsta: string): string | null {
  const v = vrsta.toLowerCase();
  if (/zemljišč|zemljisc|parcel|\bposest|gozd|travnik|njiv|vinograd|sadovnjak|\bland\b|\bplot\b/.test(v)) return "posest";
  if (/garaž|garaz|parkirn/.test(v)) return "garaza";
  if (/počitnišk|pocitnisk/.test(v)) return "pocitniski_objekt";
  if (/vikend|zidanic|brunaric/.test(v)) return "vikend";
  if (/poslovn|pisarn|lokal|trgovin|skladišč|skladisc|\bhal[ae]?\b|gostin|hotel|penzion|proizvod|ordinacij|delavnic|industrij/.test(v))
    return "poslovni_prostor";
  if (/^(?:enota|stanovanje)\b/.test(v)) return "stanovanje";
  if (/hiš|hisa|\bvil[ae]?\b|dvojček|dvojcek|vrstn|domačij|domacij|kmetij|dvorec|\bhouse\b|\bvilla\b/.test(v)) return "hisa";
  if (/stanovanj|garsonjer|apartma|studio|penthouse|sobno|\bflat\b|\bapartment\b/.test(v)) return "stanovanje";
  return null;
}

/** "Samostojna hiša" -> "samostojna", "Poslovni prostor – pisarna" -> "pisarna". */
function podtipIzVrste(vrsta: string): string | null {
  const p = vrsta
    .toLowerCase()
    .replace(/poslovni prostor|stanovanje|zemljišče|zemljisce|počitniški objekt|hiša|hisa|vikend/g, " ")
    .replace(/^[\s–—-]+|[\s–—-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return p || null;
}

/**
 * Regija samo, kadar jo vir IZRECNO pove: kot prvo besedo lokacije
 * ("Podravska Šentilj", samo "Goriška") ali kot mesto Ljubljana. "Primorska"
 * in "Kraška" nista statistični regiji (obala, Kras, Goriška se prekrivajo),
 * zato ostaneta brez regije.
 */
const REGIJSKE_BESEDE: Record<string, string | null> = {
  podravska: "podravska",
  pomurska: "pomurska",
  gorenjska: "gorenjska",
  dolenjska: "dolenjska",
  savinjska: "savinjska",
  koroška: "koroska",
  koroska: "koroska",
  notranjska: "notranjska",
  goriška: "goriska",
  goriska: "goriska",
  posavska: "posavska",
  zasavska: "zasavska",
  primorska: null,
  kraška: null,
  kraska: null,
  obala: null,
  istra: null,
};

/**
 * Kraj = naselje. Vir piše "Ljubljana Zalog", "Domžale center", "Podravska
 * Šentilj", "Hrvaška – Novigrad"; šifrant krajev pozna "Ljubljana",
 * "Domžale", "Šentilj", "Novigrad". Četrt ostane v naslovu in opisu.
 */
function krajInRegija(lokacija: string | null, slovenija: boolean): { kraj: string | null; regija: string | null } {
  if (!lokacija) return { kraj: null, regija: null };
  let t = lokacija
    .replace(/\s+[–—-]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:hrvaška|hrvatska|slovenija|italija|španija|francija|turčija)\b[\s,:]*/i, "");

  let regija: string | null = null;
  const prva = t.split(" ")[0].toLowerCase();
  // "Koroška Bela" in "Koroška vrata" sta kraj oziroma četrt, ne regija.
  if (prva in REGIJSKE_BESEDE && !/^koroška\s+(?:bela|vrata)\b/i.test(t)) {
    regija = slovenija ? REGIJSKE_BESEDE[prva] : null;
    t = t.slice(prva.length).trim();
  }

  if (/^ljubljana\s+okolica$/i.test(t)) return { kraj: null, regija: slovenija ? "ljubljana-okolica" : regija };
  t = t.replace(/\s+(?:center|centre)$/i, "").trim();
  if (/^ljubljana\b/i.test(t)) {
    t = "Ljubljana";
    if (slovenija && !regija) regija = "ljubljana-mesto";
  } else if (/^maribor\b/i.test(t)) {
    t = "Maribor";
  }
  return { kraj: t || null, regija };
}

/**
 * Cena samo, kadar je CELOTNA: prodajna ali mesečna najemnina. Vir piše tudi
 * "35,29€ / m2 / mesec" in "300€ / m2" — to je cena na kvadratni meter, ne
 * cena oglasa (ostane v opisu in raw). "10,00" brez valute pri poslovnem
 * prostoru v Kopru je nadomestek, ne cena.
 */
function cenaOglasa(cena: string | null, enota: string | null, posel: string): number | null {
  if (!cena || !cena.includes("€")) return null;
  const e = (enota ?? "").toLowerCase().replace(/\s+/g, "");
  if (/m2|m²/.test(e)) return null;
  if (posel === "prodaja" && /mesec/.test(e)) return null;
  const n = cenaIz(cena);
  if (n === null || n < 10) return null;
  if (/^9{5,}$/.test(String(Math.round(n)))) return null; // 99999, 9999999 …
  return n;
}

/** "Dvostanovanjska hiša" -> 2 — vir sam pove število stanovanj v stavbi. */
const STANOVANJ_V_BESEDI: [RegExp, number][] = [
  [/dvostanovanjsk/, 2],
  [/tristanovanjsk/, 3],
  [/(?:š|s)tiristanovanjsk/, 4],
  [/petstanovanjsk/, 5],
  [/(?:š|s)eststanovanjsk/, 6],
];

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const rez = r as RezinaBaza;
  const s = (k.surovo ?? {}) as Partial<SurovoBaza>;
  const vrsta = s.vrsta ?? k.naslovVrstica ?? "";
  const tip = tipIzVrste(vrsta);
  const slovenija = rez.drzava === 0;
  const { kraj, regija } = krajInRegija(s.lokacija ?? k.lokacija, slovenija);

  const velikost = stevilo(s.povrsina?.match(/([\d.,]+)\s*m/i)?.[1]);
  const m2 = velikost !== null && velikost > 0 ? velikost : null;

  // Enote samo, kadar jih stavba IMA po besedi vira. "Enota v dvostanovanjski
  // hiši" je eno stanovanje — število stanovanj v hiši ni njena lastnost.
  const v = vrsta.toLowerCase();
  const enaEnota = tip === "stanovanje" || tip === "garaza";
  const stEnot = enaEnota ? null : (STANOVANJ_V_BESEDI.find(([re]) => re.test(v))?.[1] ?? null);
  const vecEnot = !enaEnota && (stEnot !== null || /večstanovanjsk|vecstanovanjsk|apartmajsk/.test(v));
  const iz = izOpisa(k.naslovVrstica ?? "");

  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip,
    podtip: podtipIzVrste(vrsta),
    posel: rez.posel,
    regija,
    kraj,
    cenaEur: cenaOglasa(s.cena ?? null, s.cenaEnota ?? null, rez.posel),
    // Velikost s kartice je GLAVNA velikost oglasa; na preverjenem detajlu
    // (Branik) je bila enaka "Skupni površini", ne "Bivalni". Pri zemljišču
    // je to zemljišče.
    povrsinaM2: tip === "posest" ? null : m2,
    zemljisceM2: tip === "posest" ? m2 : null,
    letoIzgradnje: null,
    letoAdaptacije: null,
    nadstropje: null,
    vecEnot,
    stEnot,
    stEnotOcena: null,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: iz.zaObnovo,
    zaInvesticijo: iz.zaInvesticijo || /apartmajsk/.test(v),
    // Hrvaški oglas mora to povedati tudi v besedilu — kraj "Umag" sam ne.
    opis: [k.opis, slovenija ? null : "Hrvaška"].filter(Boolean).join(". ") || null,
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    slikaUrl: k.slika,
    stSlik: k.stSlik,
    raw: { kartica: s, rezina: rez.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  // Crawl-delay ni naveden; 8 s je naš privzeti razmik za tuje vire.
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  // Poln obhod vidi ~1.900 kartic (1215 + 67 + 649) manj prodanih/oddanih;
  // pod 600 je skoraj gotovo pokvarjeno branje, ne trg.
  pricakovanRazpon: [600, 6_000],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  // Poln obhod = 41 + 3 + 22 = 66 strani; 20 na dan ga opravi v ~3,5 dneh.
  najvecStrani: 20,
  dnevnaMejaStrani: 20,
  dnevniProracunVira: 25,
  // Varovalka: slovenska prodaja ima danes 41 strani.
  najvecStraniNaRezino: 60,
  // "sort=newest" je trditev teme, ne meritev: na prvi strani so ID-ji
  // pomešani (78274, 78216, 74922, 55659 … 16070). Brez test:razvrstitev ne.
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (Yoast, 28.–29. 9. 2026) ima eno skupino za * s praznim Disallow — dovoljeno je vse, " +
    "Crawl-delay in Content-Signal nista navedena, strani nosijo meta robots \"index, follow\". Edini pravni " +
    "besedili sta PDF-ja \"Splošni pogoji poslovanja\" (12. 2. 2024, samo razmerje agencija–naročitelj) in " +
    "\"Politika zasebnosti\" (osebni podatki obiskovalcev); o rabi spletišča, robotih, zbirkah ali ponovni rabi " +
    "ne govorita, spletnih pogojev uporabe ni. Presoja in dva neodvisna skeptika (pravni in tehnični) nista " +
    "našla omejitve. POGOJI: beremo samo strežniško izrisan seznam /si/ponudba/ z 8 s razmika in hranimo samo " +
    "dejstva s povezavo nazaj — fotografij in opisov ne kopiramo (© BAZA agencija d.o.o.; slika le kot povezava, " +
    "brez arhiva slik), podatkov agentov ne hranimo, obrazcev (Turnstile/reCAPTCHA), /wp-json in admin-ajax.php " +
    "se ne dotikamo.",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("bazarealestate.com se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
