import type { NormaliziranOglas } from "../db.js";
import { cenaIz, stevilo } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, prenesi } from "./http.js";
import { izreziObjekt, rscBesedilo } from "./rsc.js";

/**
 * agenti-nep.si — Agenti nepremičnine d.o.o., Slovenska Bistrica.
 *
 * Zakaj ta vir: majhna regijska agencija (267 oglasov, 29. 9. 2026) —
 * Slovenska Bistrica, Poljčane, Šentjur, Pomurje — plus nekaj tujine (Pag,
 * Kyrenia na Severnem Cipru). Taksonomija ima podvrsto "Hotel" (id 190 pod
 * Poslovni prostor), ki je uporabnik išče; na pregledanih straneh je sicer ni
 * bilo. Oglase agencija po lastnih pogojih objavlja tudi na Bolhi,
 * nepremicnine.net in Mojih kvadratih, kvadrat.si pa jih pobira — prekrivanje
 * je pričakovano, prednost je le, da je lastna stran agencije prva.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt je SAMO Cloudflarova predloga komentarjev o "content signals":
 *     niti ene vrstice User-agent, Disallow, Crawl-delay ali Content-Signal.
 *     Po RFC 9309 pravil ni; po točki (c) same predloge signal "niti ne
 *     dovoljuje niti ne omejuje". Ker ga upravlja Cloudflare in se lahko
 *     spremeni brez vednosti agencije, ga adapter pred vsakim krogom prebere
 *     znova (preveriRobots) in se ustavi, če se pojavi pravilo.
 *   - Splošni pogoji (od 20. 8. 2022) so posredniški pogoji za NAROČNIKE; edina
 *     klavzula o bazi podatkov veže naročitelja, ne obiskovalca. Stran s
 *     piškotki je obvestilo po ZEKom-1. O robotih, zajemu ali zbirkah nič.
 *   - POGOJI: fotografij (bunny.100m2.si) ne kopiramo — hranimo le povezavo;
 *     robots.txt tega gostitelja ne obstaja (pravi 404 BunnyCDN, 29. 9. 2026),
 *     zato je povezava dovoljena. Podatkov agentov (ime, telefon, e-pošta so
 *     samo na detajlu) ne hranimo. Opisov ne objavljamo dobesedno.
 *
 * Tehnično: Next.js na platformi 100m2 (agencija 87) za Cloudflarom, brez
 * izziva. Kartice so v toku RSC strežniško izrisanega HTML-ja (glej rsc.ts) —
 * NE kot podatkovni objekti, ampak kot izrisano React drevo, zato beremo
 * besedila po ikonah, ki jih vir postavi pred vsako polje. Strani ?_rsc= in
 * glav RSC/Next-Router-* ne uporabljamo: to bi bila notranja pot.
 *
 * Detajlov (2. faza) NI: detajlni tok ima price_first, num_room, opis in
 * is_investment, a DetajlPolitika zna brati samo stran v brskalniku. Glej
 * poročilo (shared_changes_needed).
 */

const VIR = "agenti-nep.si";
const OSNOVA = "https://www.agenti-nep.si";

/**
 * Razmik 10 s. Crawl-delay ni naveden (8 s je naš najmanjši za tuje vire);
 * dve sekundi več, ker je vsaka stran seznama ~1,45 MB — večino tega so
 * šifranti krajev (4.923) in okrajev (10.746), ki jih vir vgradi v vsako stran.
 */
const ZAMIK_MS = 10_000;

/** Kar pove ena kartica seznama — besedila, kakor jih vir izpiše. */
type Kartica = {
  href: string;
  /** "Podravska, Slovenska Bistrica, Šmartno na Pohorju" = regija, občina, okraj/naselje. */
  lokacija: string | null;
  /** "Hiša", "Poslovni prostor" … (šifrant property_type). */
  vrsta: string | null;
  /** "Dvojček", "Hotel", "Zazidljiva" … (šifrant property_subtype). */
  podvrsta: string | null;
  /** "121.3 m2" — pri parceli je to zemljišče. */
  povrsina: string | null;
  /** "170.000 €", "430 €/mesec", "349.900 €/ddv v ceni", "2 €/m2/mesec". */
  cena: string | null;
  slika: string | null;
};

/**
 * EN SAM SEZNAM. Cel katalog je 18 strani po 15 (267 oglasov); delitev po
 * vrstah bi dodala delne zadnje strani in s tem zahtevke, ne pa oglasov.
 * Posel in vrsto pove vsaka kartica sama.
 */
const REZINE: Rezina[] = [{ oznaka: "vse" }];

/**
 * sort=activate_dt-desc ("Novejši naprej") je privzeta razvrstitev vira, a jo
 * pišemo izrecno, da nas sprememba privzetka ne premeša. Izmerjeno 29. 9. 2026:
 * stran 1 je enaka stran 1 presoje (28. 9.), zamaknjena za natanko en oglas —
 * 543693, ki je bil vmes aktiviran, stoji na vrhu; zadnja stran (18) nosi 12
 * najstarejših (438595–466494). "Nestabilna razvrstitev" iz presoje je bil
 * prav ta vmesni oglas.
 */
function seznamUrl(_r: Rezina, stran: number): string {
  return `${OSNOVA}/oglasi?sort=activate_dt-desc&page=${Math.max(1, stran)}`;
}

// --- robots.txt pred vsakim krogom -------------------------------------------

/** Kdaj je bil robots.txt nazadnje prebran in brez pravil (ms od epohe). */
let robotsPreverjenOb = 0;
/** Urnik ima dva kroga na dan; 6 ur pomeni en ogled robots.txt na krog. */
const ROBOTS_VELJA_MS = 6 * 3_600_000;
/** Vrstice, ki bi pomenile pravilo. Sitemap ni omejitev, zato ga ni tu. */
const PRAVILO_ROBOTS = /^\s*(user-agent|disallow|allow|crawl-delay|content-signal)\s*:/i;

/**
 * Presoja je vir dovolila, ker robots.txt NIMA pravil. To je stanje in ne
 * obljuba: datoteko piše Cloudflare in ji lahko doda Content-Signal ali
 * Disallow. Takrat se ustavimo in počakamo na človeka — ne ugibamo, ali nova
 * vrstica nas zadeva.
 *
 * Sporočilo namenoma nima besed, ki jih klasificiraj() šteje za blokado ali
 * pokvarjen parser: vir nas ni zavrnil in HTML je v redu; spremenila so se
 * pravila, in to je odločitev za lastnika, ne za hlajenje.
 */
/** Vrne true, kadar je robots.txt v tem klicu res prebral (dodaten zahtevek). */
async function preveriRobots(ua: string): Promise<boolean> {
  if (Date.now() - robotsPreverjenOb < ROBOTS_VELJA_MS) return false;
  let besedilo = "";
  try {
    besedilo = await prenesi(`${OSNOVA}/robots.txt`, ua);
  } catch (e) {
    const s = e instanceof Error ? e.message : String(e);
    // RFC 9309: 404/410 = pravil ni. 403/429, 5xx ali omrežje = ne beremo
    // (napako vrnemo glavni zanki, ki jo razvrsti in ukrepa).
    if (!/HTTP 4(?:04|10)\b/.test(s)) throw e;
  }
  const pravilo = besedilo.split(/\r?\n/).find((v) => PRAVILO_ROBOTS.test(v));
  if (pravilo) {
    throw new Error(
      `robots.txt agenti-nep.si ima novo pravilo ("${pravilo.trim().slice(0, 80)}") — ` +
        "zajem ustavljen do nove pravne presoje"
    );
  }
  robotsPreverjenOb = Date.now();
  // robots.txt je zahtevek kot vsak drug: pred stranjo seznama počakamo, ker
  // skupni ritem (pocakajNaVrsto) je štel samo en zahtevek.
  await new Promise((r) => setTimeout(r, ZAMIK_MS));
  return true;
}

async function preberiHttp(
  r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  const prebralRobots = await preveriRobots(ua);
  try {
    return karticeIzHtml(await prenesi(seznamUrl(r, stran), ua), stran);
  } finally {
    // Ta klic je poslal DVA zahtevka, skupni ritem pa je pred njim odštel en
    // razmik. Drugega odčakamo tu, sicer bi naslednja stran (1,45 MB) sledila
    // takoj (recenzija 29. 9. 2026).
    if (prebralRobots) await new Promise((res) => setTimeout(res, ZAMIK_MS));
  }
}

// --- razčlenjevanje seznama ---------------------------------------------------

type Element = ["$", string, unknown, Record<string, unknown> | null];

function jeElement(n: unknown): n is Element {
  return Array.isArray(n) && n.length >= 4 && n[0] === "$" && typeof n[1] === "string";
}

/**
 * Besedilo vozlišča. "$undefined" je Reactov nadomestek za prazno polje
 * (kartica brez podvrste ga ima namesto besedila) in ni podatek. Površina
 * pride kot HTML ("| 121.3 m<sup>2</sup>") — oznake in vodilni "|" odrežemo.
 */
function cisto(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = brezEntitet(s.replace(/<[^>]+>/g, ""))
    .replace(/^\s*\|\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t && t !== "$undefined" ? t : null;
}

/**
 * Kartica je izrisano drevo brez imen polj. Vir pa pred vsako polje postavi
 * ikono — location, house, surface, bed — in to je edino stabilno sidro:
 * vrstni red ni stalen (pri parceli se "$undefined" vrine pred površino,
 * kartica brez podvrste nima ikone postelje). Beremo zato "prvi <p> za
 * ikono X", lokacijo iz <h2> in ceno iz velikega <p>.
 */
function karticaIz(href: string, otroci: unknown): Kartica {
  const k: Kartica = { href, lokacija: null, vrsta: null, podvrsta: null, povrsina: null, cena: null, slika: null };
  let ikona: string | null = null;

  const vpisi = (besedilo: string | null, oznaka: string, razred: string) => {
    if (oznaka === "h2") {
      k.lokacija ??= besedilo;
    } else if (oznaka === "p" && /\btext-body-lg\b/.test(razred)) {
      k.cena ??= besedilo;
    } else if (oznaka === "p") {
      if (ikona === "house-icon") k.vrsta ??= besedilo;
      else if (ikona === "surface-icon") k.povrsina ??= besedilo;
      else if (ikona === "bed-icon") k.podvrsta ??= besedilo;
    } else {
      return; // gumb "Več" in podobno ne porabi ikone
    }
    ikona = null;
  };

  const obisci = (n: unknown): void => {
    if (jeElement(n)) {
      const p: Record<string, unknown> = n[3] ?? {};
      if (typeof p.src === "string") {
        const ime = p.src.match(/\/icons\/([a-z-]+)\.svg/)?.[1];
        if (ime) ikona = ime;
        else if (!k.slika && /^https:\/\//.test(p.src)) k.slika = p.src;
      }
      const razred = typeof p.className === "string" ? p.className : "";
      const html = (p.dangerouslySetInnerHTML as { __html?: unknown } | undefined)?.__html;
      if (html !== undefined) vpisi(cisto(html), n[1], razred);
      else if (typeof p.children === "string") vpisi(cisto(p.children), n[1], razred);
      else obisci(p.children);
      return;
    }
    if (Array.isArray(n)) for (const x of n) obisci(x);
  };

  obisci(otroci);
  return k;
}

/** "prodaja" ali "oddaja" iz poti /oglas/{id}-{posel}-{vrsta}-…; sicer iz cene. */
function poselIz(href: string, cena: string | null): "prodaja" | "oddaja" {
  const izPoti = href.match(/^\/oglas\/\d+-(prodaja|oddaja)-/)?.[1];
  if (izPoti === "prodaja" || izPoti === "oddaja") return izPoti;
  return /\/\s*mesec/i.test(cena ?? "") ? "oddaja" : "prodaja";
}

/** Posel z veliko začetnico, kakor ga vir piše v naslovu detajla. */
const Posel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

/** Čisto razčlenjevanje strani — brez omrežja, zato ga je mogoče preizkusiti na shranjeni strani. */
export function karticeIzHtml(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const t = rscBesedilo(html);

  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  const iskano = '{"href":"/oglas/';
  for (let i = t.indexOf(iskano); i >= 0; i = t.indexOf(iskano, i + iskano.length)) {
    const kos = izreziObjekt(t, i);
    if (!kos) continue;
    let o: { href?: unknown; children?: unknown } | null = null;
    try {
      o = JSON.parse(kos) as { href?: unknown; children?: unknown };
    } catch {
      // Pokvarjen kos preskočimo — raje manj kartic kot napačne.
    }
    if (!o || typeof o.href !== "string") continue;
    // Številka oglasa je stabilna; slug za njo se spremeni z vrsto ali krajem.
    const id = o.href.match(/^\/oglas\/(\d+)-/)?.[1];
    if (!id || videni.has(id)) continue;
    videni.add(id);

    const k = karticaIz(o.href, o.children);
    const posel = Posel(poselIz(k.href, k.cena));
    const jeParcela = /^parcela$/i.test(k.vrsta ?? "");
    kartice.push({
      url: `${OSNOVA}${k.href}`,
      virId: id,
      lokacija: k.lokacija,
      // Kot naslov detajla pri viru: "Prodaja, Poslovni prostor, Gostinski lokal, Podravska, Poljčane, 43.85 m2".
      naslovVrstica: [posel, k.vrsta, k.podvrsta, k.lokacija, k.povrsina].filter(Boolean).join(", ") || null,
      // Kartica nima opisa; sestavimo ga iz polj, da ga bere detektor
      // nastanitve ("Poslovni prostor, Hotel") in da iskalnik najde kraj.
      opis:
        [
          posel,
          k.vrsta,
          k.podvrsta,
          k.povrsina ? (jeParcela ? `${k.povrsina} zemljišča` : k.povrsina) : null,
          k.lokacija,
          k.cena ? `cena: ${k.cena}` : null,
        ]
          .filter(Boolean)
          .join(", ") || null,
      cenaBesedilo: k.cena,
      telefon: null, // agentov na seznamu ni; na detajlu so osebni podatki in jih ne hranimo
      agencija: "Agenti nepremičnine d.o.o. (agenti-nep.si)",
      slika: k.slika,
      stSlik: null,
      surovo: { ...k },
    });
  }

  // Oštevilčenje: povezave strani so brez href (izris na odjemalcu), zato
  // beremo objekt, ki ga dobi komponenta: {"current":1,"pageSize":15,"total":267}.
  const pag = t.match(/\{"current":(\d+),"pageSize":(\d+),"total":(\d+)/);
  const velikost = pag ? Number(pag[2]) : 0;
  const skupaj = pag ? Number(pag[3]) : null;
  const zadnjaStran =
    skupaj !== null && velikost > 0
      ? Math.max(1, Math.ceil(skupaj / velikost))
      : kartice.length > 0
        ? stran
        : null;
  return { kartice, zadnjaStran, skupajZadetkov: skupaj };
}

// --- normalizacija -----------------------------------------------------------

/** Vrsta vira -> naš tip. "Soba" (oddaja sobe) je del stanovanja, ne nastanitev. */
const TIPI: Record<string, string> = {
  stanovanje: "stanovanje",
  "hiša": "hisa",
  parcela: "posest",
  "počitniški objekt": "pocitniski_objekt",
  "poslovni prostor": "poslovni_prostor",
  "garaža/parkirno mesto": "garaza",
  soba: "stanovanje",
};

/** Rezerva, če kartica vrste ne izpiše: drugi del poti /oglas/{id}-{posel}-{vrsta}-…. */
const TIPI_IZ_POTI: [RegExp, string][] = [
  [/^\/oglas\/\d+-\w+-stanovanje-/, "stanovanje"],
  [/^\/oglas\/\d+-\w+-hisa-/, "hisa"],
  [/^\/oglas\/\d+-\w+-parcela-/, "posest"],
  [/^\/oglas\/\d+-\w+-pocitniski-objekt-/, "pocitniski_objekt"],
  [/^\/oglas\/\d+-\w+-poslovni-prostor/, "poslovni_prostor"],
  [/^\/oglas\/\d+-\w+-garaza/, "garaza"],
  [/^\/oglas\/\d+-\w+-soba-/, "stanovanje"],
];

function tipIz(k: Partial<Kartica>): { tip: string | null; podtip: string | null } {
  const vrsta = (k.vrsta ?? "").toLowerCase();
  let tip = TIPI[vrsta] ?? TIPI_IZ_POTI.find(([re]) => re.test(k.href ?? ""))?.[1] ?? null;
  const podvrsta = k.podvrsta?.toLowerCase() ?? null;
  // Počitniški objekt ima podvrsti "Vikend" in "Koča" — to sta vikenda v
  // našem pomenu; apartma, hiša in mobilna hiška ostanejo počitniški objekt.
  if (tip === "pocitniski_objekt" && (podvrsta === "vikend" || podvrsta === "koča")) tip = "vikend";
  // Pri sobi je podvrsta število postelj ("Dvoposteljna") — to pove opis.
  const podtip = vrsta === "soba" ? "soba" : podvrsta;
  return { tip, podtip };
}

/**
 * Regije platforme 100m2 so natanko razdelitev, ki jo uporabljamo (tudi
 * nepremicnine.net): Ljubljana / Ljubljana okolica, Jugovzhodna Slovenija =
 * dolenjska, Notranjsko-kraška = notranjska, Spodnjeposavska = posavska.
 * Preslikava je ena-na-ena iz šifranta vira (codeRegisters.region), ne ugibanje.
 */
const REGIJE: Record<string, string> = {
  ljubljana: "ljubljana-mesto",
  "ljubljana okolica": "ljubljana-okolica",
  gorenjska: "gorenjska",
  "goriška": "goriska",
  "jugovzhodna slovenija": "dolenjska",
  "koroška": "koroska",
  "notranjsko-kraška": "notranjska",
  "obalno-kraška": "obalno-kraska",
  podravska: "podravska",
  pomurska: "pomurska",
  spodnjeposavska: "posavska",
  savinjska: "savinjska",
  zasavska: "zasavska",
};

/**
 * "Podravska, Slovenska Bistrica, Šmartno na Pohorju" -> podravska, Šmartno na Pohorju.
 * Tujina ima državo in županijo kot regijo ("Hrvaška, Zadarska županija, Pag")
 * ali samo kraj ("Kyrenia") — regije takrat ni, kraj je zadnji del.
 *
 * Kraj je NAJBOLJ NATANČEN del, ki ga vir pove. Pri mestnih občinah je to
 * lahko mestna četrt ("Celje, Lava", "Maribor, Studenci"); občina ostane v
 * lokaciji in opisu, zato jo iskalnik še vedno najde.
 */
function krajIz(lokacija: string | null | undefined): { regija: string | null; kraj: string | null } {
  const deli = (lokacija ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (deli.length === 0) return { regija: null, kraj: null };
  const kljuc = deli[0].toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
  const regija = REGIJE[kljuc] ?? null;
  if (regija) return { regija, kraj: deli.length > 1 ? deli[deli.length - 1] : null };
  return { regija: null, kraj: deli[deli.length - 1] };
}

/**
 * Vir izpiše površino, kakor jo je vpisal agent — in agenti pišejo dvoje:
 * surovo število s piko kot decimalko ("116.73 m2", "2292 m2") in slovensko
 * s piko kot ločilom tisočic ("21.858 m2" pri gozdu za 21.858 € — 1 €/m²,
 * 29. 9. 2026). Skupni stevilo() loči prav to: pika z eno ali dvema
 * številkama je decimalka, skupina treh so tisočice. Decimalk na tri mesta
 * vir ne izpiše (121.3 in ne 121.300), zato je pravilo tu varno.
 */
function povrsinaIz(t: string | null | undefined): number | null {
  const n = stevilo(t?.match(/(\d[\d.,]*)\s*m/)?.[1]);
  return n !== null && n > 0 ? n : null;
}

/**
 * Samo prava skupna cena. "2 €/m2/mesec" je cena na kvadratni meter (pri
 * skladiščih za oddajo) — zmnožek s površino bi bil naš izračun, ne cena vira,
 * zato null; besedilo ostane v opisu in raw. "349.900 €/ddv v ceni" in
 * "270.000 €+ ddv" sta skupni ceni (z/brez DDV). Nadomestki (9.999.999 …) in
 * "po dogovoru" (brez številke) so null.
 */
function cenaIzKartice(t: string | null, posel: string): number | null {
  if (!t) return null;
  if (/\/\s*m(?:2|²)/i.test(t)) return null;
  if (posel === "prodaja" && /\/\s*mesec/i.test(t)) return null;
  const n = cenaIz(t);
  if (n === null || n <= 1) return null;
  if (/^9{5,}$/.test(String(Math.round(n)))) return null;
  return n;
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const s = (k.surovo ?? {}) as Partial<Kartica>;
  const posel = poselIz(s.href ?? k.url.replace(OSNOVA, ""), s.cena ?? k.cenaBesedilo);
  const { tip, podtip } = tipIz(s);
  const { regija, kraj } = krajIz(s.lokacija ?? k.lokacija);
  const m2 = povrsinaIz(s.povrsina);
  const jeHotel = podtip === "hotel";
  // Enote samo, kadar jih vir pove sam: "Dvostanovanjska" hiša je njegova
  // kategorija z dvema stanovanjema. "Večstanovanjska" pove "več", ne koliko.
  const dvostanovanjska = podtip === "dvostanovanjska";
  const vecEnot = dvostanovanjska || podtip === "večstanovanjska";
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip,
    podtip,
    posel,
    regija,
    kraj,
    cenaEur: cenaIzKartice(k.cenaBesedilo, posel),
    // Pri parceli je edina številka zemljišče; bivalne površine tam ni.
    povrsinaM2: tip === "posest" ? null : m2,
    zemljisceM2: tip === "posest" ? m2 : null,
    letoIzgradnje: null,
    letoAdaptacije: null,
    nadstropje: null,
    vecEnot,
    stEnot: dvostanovanjska ? 2 : null,
    stEnotOcena: null,
    loceneKuhinje: null,
    looceniVhodi: null,
    zaObnovo: false,
    zaInvesticijo: jeHotel || podtip === "za investicijo",
    opis: k.opis,
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    // Povezava na izvirnik (hotlink), datoteke ne prenašamo: bunny.100m2.si
    // nima robots.txt (404), presoja pa kopiranje fotografij izključuje.
    slikaUrl: k.slika && /^https:\/\/bunny\.100m2\.si\//.test(k.slika) ? k.slika : null,
    stSlik: null,
    raw: { kartica: s, rezina: r.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  omejitve: { zamikMs: ZAMIK_MS },
  crawlDelayS: null,
  // 267 oglasov (29. 9. 2026). Pod 100 v celem krogu je pokvarjeno branje.
  pricakovanRazpon: [100, 1_500],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  /**
   * Cel obhod je 18 strani (~26 MB). Dnevno 12 strani, na krog največ 8:
   * prvi krog dneva vzame 2 za prelet novih + 6 obhoda, drugi 2 + 2. Obhod se
   * sklene v dobrih dveh dneh — za agencijo, ki na dan doda oglas ali dva,
   * dovolj, za majhen strežnik pa ~17 MB na dan namesto ~26.
   */
  najvecStrani: 8,
  najvecStraniNaRezino: 30, // varovalka: 30 × 15 = 450 oglasov, skoraj dvakrat več od kataloga
  dnevnaMejaStrani: 12,
  dnevniProracunVira: 15,
  /**
   * Izmerjeno z opazovanjem, ne s test:razvrstitev (ta zna samo brskalnik):
   * vir sam razvršča po activate_dt ("Novejši naprej"), med 28. in 29. 9. je
   * bil nov oglas na vrhu strani 1 in vse ostalo zamaknjeno za enega, zadnja
   * stran nosi najstarejše številke. Tveganja ni: del B (polni obhod) teče z
   * samoNovo=false, zastavica doda le prelet prvih dveh strani.
   */
  razvrsceniPoNovosti: true,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (28. in 29. 9. 2026) je samo Cloudflarova predloga komentarjev o \"content signals\" brez ene " +
    "same vrstice User-agent, Disallow, Crawl-delay ali Content-Signal — pravil ni, zato ga adapter pred vsakim " +
    "krogom prebere znova in se ustavi, če se pravilo pojavi. Splošni pogoji (od 20. 8. 2022) so posredniški " +
    "pogoji za naročnike in o rabi spletišča, robotih ali zbirkah ne govorijo; stran s piškotki je le obvestilo " +
    "po ZEKom-1. Presoja in dva neodvisna skeptika (pravni + tehnični) niso našli omejitve — to je odsotnost " +
    "prepovedi, ne izrecno dovoljenje. POGOJI: fotografij (bunny.100m2.si, robots.txt tam ne obstaja) ne kopiramo, " +
    "hranimo le povezavo; podatkov agentov ne hranimo; opisov ne objavljamo dobesedno; razmik 10 s, Crawl-delay ni naveden.",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("agenti-nep.si se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
