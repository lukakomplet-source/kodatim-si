/**
 * Pregled v4 (Luka, 7. 11. 2026): marketing in prodaja ločeno, ena pot od kontakta do denarja, vse iz istega vira
 * (Harvey Kompletko: dogodki, priložnosti, cilji, stroški; aplikacija Kompletko za opravljene naloge). Brez strežnika,
 * zato računa tudi brskalnik ob vsakem filtru.
 *
 * Pravila (enaka povsod na strani):
 * - kohorta: podjetja, PRVIČ kontaktirana v obdobju, in kako daleč so prišla do danes (veriga, marketing, kampanje);
 * - pripis: vsako podjetje, priložnost in posel pripada kampanji prvega maila (prvi stik), zato je en posel v eni kampanji;
 * - pozitiven odziv je Lukova razvrstitev (stran samo predlaga); lead ostane »da« konkretnemu koraku;
 * - priložnosti: kohorta so priložnosti, odprte v obdobju; kanban in »Kaj moramo narediti« sta stanje danes;
 * - česar nihče ne beleži (odprtja mailov, stroški brez vnosa, cilji brez vnosa), je N/A, nikoli 0;
 * - napoved je vedno ločena od dejanskega in označena kot ocena.
 */

import {
  MESECI_KRATKO,
  enaNaPodjetje,
  kontaktirana,
  lepDatum,
  odstotek,
  ponedeljek,
  premakniDan,
  vRazponu,
  type CiljPregled,
  type Dogodek,
  type PregledPodatki,
  type PriloznostPregled,
  type Razpon,
  type StrosekPregled,
} from "./pregled-racun";
import {
  IME_PRODUKTA,
  NAJMANJ_ZA_OCENO,
  NI_ZAPISANO,
  dniMed,
  kratkoIme,
  oblika,
  pogodbenaVrednost,
  type Akcija,
  type NalogAplikacije,
  type PoselVrednost,
} from "./pregled-vodstvo";

type Podjetja = PregledPodatki["podjetja"];

// ——— faze prodaje ———

export type FazaProdaje = PriloznostPregled["faza"];

export const FAZE_PRODAJE: { kljuc: FazaProdaje; ime: string }[] = [
  { kljuc: "pozitiven", ime: "Pozitiven odziv" },
  { kljuc: "kvalificiran", ime: "Kvalificiran lead" },
  { kljuc: "sestanek", ime: "Sestanek" },
  { kljuc: "ponudba", ime: "Ponudba poslana" },
  { kljuc: "pogajanja", ime: "Pogajanja" },
  { kljuc: "dobljeno", ime: "Dobljeno" },
  { kljuc: "izgubljeno", ime: "Izgubljeno" },
];
export const IME_FAZE_PRODAJE = Object.fromEntries(FAZE_PRODAJE.map((f) => [f.kljuc, f.ime])) as Record<FazaProdaje, string>;
export const ODPRTE_FAZE: FazaProdaje[] = ["pozitiven", "kvalificiran", "sestanek", "ponudba", "pogajanja"];
/** Vrstni red za »prišla do te faze ali dlje«; izgubljeno ni stopnja naprej. */
const RED: Record<FazaProdaje, number> = { pozitiven: 0, kvalificiran: 1, sestanek: 2, ponudba: 3, pogajanja: 4, dobljeno: 5, izgubljeno: -1 };

export const RAZLOGI_IZGUBE: Record<string, string> = {
  cena: "Cena",
  ni_potrebe: "Ni potrebe",
  ze_imajo: "Že imajo rešitev",
  konkurenca: "Izbrali konkurenco",
  ni_odziva: "Ni več odziva",
  ni_pravi_cas: "Ni pravi čas",
  drugo: "Drugo",
};

export const RAZVRSTITVE = [
  { kljuc: "pozitiven", ime: "Pozitiven" },
  { kljuc: "nevtralen", ime: "Nevtralen" },
  { kljuc: "negativen", ime: "Negativen" },
] as const;

/** Priložnost brez aktivnosti toliko dni je zastala (Luka 7. 11.: privzeto 7). */
export const ZASTALA_DNI = 7;

const VRSTA: Record<string, string> = { enkratno: "enkratno", mesecno: "mesečno", letno: "letno" };

const EUR = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const EUR_CENTI = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** »1.200 €«; z centi samo, ko jih znesek ima (»49,90 €«, mesečna cena se ne zaokroži na 50 €). */
export function eur(v: number): string {
  return Number.isInteger(Math.round(v * 100) / 100) ? EUR.format(v) : EUR_CENTI.format(v);
}

/** Vrednost v prvem letu: enkratno (ali brez vrste) = znesek, mesečno × 12, letno = znesek; brez zneska null. */
export function letnaVrednost(o: Pick<PriloznostPregled, "vrednost" | "vrsta">): number | null {
  if (o.vrednost === null || o.vrednost === undefined) return null;
  return o.vrsta === "mesecno" ? o.vrednost * 12 : o.vrednost;
}

/** »1.200 € mesečno«, »3.000 €«; brez zneska »vrednost ni vpisana«. */
export function opisVrednosti(o: Pick<PriloznostPregled, "vrednost" | "vrsta">): string {
  if (o.vrednost === null || o.vrednost === undefined) return "vrednost ni vpisana";
  return `${eur(o.vrednost)}${o.vrsta && o.vrsta !== "enkratno" ? ` ${VRSTA[o.vrsta] ?? o.vrsta}` : ""}`;
}

/** Najdlje dosežena faza (izgubljena priložnost: do kje je prišla pred izgubo). */
export function najdlje(o: PriloznostPregled): number {
  let m = o.faza === "dobljeno" ? RED.dobljeno : 0;
  for (const f of o.faze) m = Math.max(m, RED[f.faza as FazaProdaje] ?? 0);
  return m;
}

/** Kdaj je priložnost (zadnjič) vstopila v trenutno fazo; brez zapisa čas odprtja. */
export function vstopVFazo(o: PriloznostPregled): string | null {
  for (let i = o.faze.length - 1; i >= 0; i--) if (o.faze[i].faza === o.faza) return o.faze[i].cas;
  return o.ustvarjen;
}

/** Filtri strani na priložnostih: produkt, kampanja prvega stika, podjetja osebe. */
export function zaFiltrePriloznosti(
  vse: PriloznostPregled[] | undefined,
  k: { produkt: string; kampanja: string | null; domene: Set<string> | null },
): PriloznostPregled[] {
  return (vse ?? []).filter(
    (o) =>
      (k.produkt === "vsi" || o.produkt === k.produkt) &&
      (!k.kampanja || (o.kampanja || NI_ZAPISANO) === k.kampanja) &&
      (!k.domene || k.domene.has(o.domena)),
  );
}

/** Zadnji dan, ko se je s podjetjem kaj zgodilo (dogodek ali sprememba priložnosti). */
function zadnjiDanPodjetij(dogodki: Dogodek[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of dogodki) {
    if (!e.cas || e.korak === "lead") continue;
    const d = e.cas.slice(0, 10);
    if ((m.get(e.domena) ?? "") < d) m.set(e.domena, d);
  }
  return m;
}

function zadnjaAktivnost(o: PriloznostPregled, zadnji: Map<string, string>): string | null {
  const a = (o.spremenjen ?? o.ustvarjen ?? "").slice(0, 10);
  const b = zadnji.get(o.domena) ?? "";
  const m = a > b ? a : b;
  return m || null;
}

// ——— veriga od kontakta do denarja (povzetek vodstva) ———

export type KorakVerige = "kontaktirana" | "odzivi" | "pozitivni" | "leadi" | "sestanki" | "ponudbe" | "posli" | "prihodki";

export type ClenVerige = {
  kljuc: KorakVerige;
  ime: string;
  skupina: "Marketing" | "Prodaja" | "Denar";
  /** Število podjetij (pri prihodkih znesek); null = N/A. */
  stevilo: number | null;
  /** Pretvorba iz zadnjega člena s številom (»8,1 %«), »–« brez imenovalca; pri prvem in pri prihodkih null. */
  pretvorba: string | null;
  /** Od česa je pretvorba (»od odzivov«), ker je člen pred njim lahko N/A. */
  osnova: string | null;
  /** Drobna vrstica pod številom (npr. »8 čaka razvrstitev«, »ločeno: 70.340 € v aplikaciji«). */
  opomba: string | null;
};

export type Veriga = {
  cleni: ClenVerige[];
  /** Indeks člena z največjo izgubo (med prehodi z vsaj NAJMANJ_ZA_OCENO podjetji prej); null = premalo podatkov. */
  izguba: number | null;
  /** Podjetja po členih (za predal). */
  domene: Record<Exclude<KorakVerige, "prihodki">, string[]>;
  /** Odzivi, ki jih Luka še ni razvrstil (in niso rekli ne). */
  nerazvrsceni: number;
};

const SKUPINA: Record<KorakVerige, ClenVerige["skupina"]> = {
  kontaktirana: "Marketing",
  odzivi: "Marketing",
  pozitivni: "Marketing",
  leadi: "Marketing",
  sestanki: "Prodaja",
  ponudbe: "Prodaja",
  posli: "Prodaja",
  prihodki: "Denar",
};
/** Rodilnik za »od …« pri pretvorbi. */
const OD: Record<Exclude<KorakVerige, "prihodki">, string> = {
  kontaktirana: "kontaktiranih",
  odzivi: "odzivov",
  pozitivni: "pozitivnih",
  leadi: "leadov",
  sestanki: "sestankov",
  ponudbe: "ponudb",
  posli: "poslov",
};

export const IME_VERIGE: Record<KorakVerige, string> = {
  kontaktirana: "Kontaktirana",
  odzivi: "Odzivi",
  pozitivni: "Pozitivni",
  leadi: "Leadi",
  sestanki: "Sestanki",
  ponudbe: "Ponudbe",
  posli: "Posli",
  prihodki: "Prihodki iz lijaka",
};

/** Ali je odziv podjetja (Lukova razvrstitev ali, dokler je ni, »rekli so ne«) negativen. */
function jeNegativen(dom: string, dogodki: Dogodek[], p: Podjetja): boolean {
  const r = p[dom]?.razvrstitev ?? "";
  if (r) return r === "negativen";
  return dogodki.some((e) => e.domena === dom && e.korak === "odgovor" && e.negativen);
}

/**
 * Kako daleč je prišlo podjetje (0 kontaktirano … 6 posel). Podjetje šteje do najdlje dosežene faze: posel šteje tudi
 * kot ponudba in sestanek, lead kot pozitiven odziv (veriga je zato vedno padajoča).
 */
function stopnjaPodjetja(dom: string, poKorakih: Map<string, Set<string>>, prl: PriloznostPregled[], p: Podjetja): number {
  const ima = (k: string) => poKorakih.get(k)?.has(dom) ?? false;
  const o = prl.filter((x) => x.domena === dom);
  const max = o.reduce((a, x) => Math.max(a, najdlje(x)), -1);
  if (ima("posel") || o.some((x) => x.faza === "dobljeno")) return 6;
  if (max >= RED.ponudba) return 5;
  if (ima("sestanek") || max >= RED.sestanek) return 4;
  if (ima("lead") || max >= RED.kvalificiran) return 3;
  if (o.length || p[dom]?.razvrstitev === "pozitiven") return 2;
  if (ima("odgovor")) return 1;
  return 0;
}

/**
 * Veriga za povzetek: podjetja, prvič kontaktirana v obdobju, in kako daleč so prišla do danes. Prihodki so pogodbena
 * vrednost poslov teh podjetij; aplikacija je ločena opomba (obstoječe stranke, ne iz lijaka).
 */
export function verigaProdaje(k: {
  dogodki: Dogodek[];
  podjetja: Podjetja;
  priloznosti: PriloznostPregled[];
  posli: PoselVrednost[];
  r: Razpon;
  aplikacija: number | null;
}): Veriga {
  const kohorta = kontaktirana(k.dogodki, k.r);
  const poKorakih = new Map<string, Set<string>>();
  for (const e of k.dogodki) {
    if (!kohorta.has(e.domena)) continue;
    if (!poKorakih.has(e.korak)) poKorakih.set(e.korak, new Set());
    poKorakih.get(e.korak)!.add(e.domena);
  }
  const stopnja = new Map<string, number>();
  for (const d of kohorta) stopnja.set(d, stopnjaPodjetja(d, poKorakih, k.priloznosti, k.podjetja));
  const nad = (n: number) => [...kohorta].filter((d) => (stopnja.get(d) ?? 0) >= n).sort();
  const domene = {
    kontaktirana: nad(0),
    odzivi: nad(1),
    pozitivni: nad(2),
    leadi: nad(3),
    sestanki: nad(4),
    ponudbe: nad(5),
    posli: nad(6),
  };
  const nerazvrsceni = domene.odzivi.filter(
    (d) => (stopnja.get(d) ?? 0) === 1 && !k.podjetja[d]?.razvrstitev && !jeNegativen(d, k.dogodki, k.podjetja),
  ).length;
  const posliKohorte = k.posli.filter((p) => kohorta.has(p.domena));
  const vrednosti = posliKohorte.map(pogodbenaVrednost).filter((v): v is number => v !== null);
  const prihodki = vrednosti.length ? vrednosti.reduce((a, b) => a + b, 0) : posliKohorte.length ? null : 0;

  const vrstni: Exclude<KorakVerige, "prihodki">[] = ["kontaktirana", "odzivi", "pozitivni", "leadi", "sestanki", "ponudbe", "posli"];
  const cleni: ClenVerige[] = [];
  let prej: number | null = null;
  let prejIme: string | null = null;
  for (const kl of vrstni) {
    let n: number | null = domene[kl].length;
    let opomba: string | null = null;
    if (kl === "pozitivni" && nerazvrsceni) {
      opomba = `${nerazvrsceni} ${oblika(nerazvrsceni, ["čaka", "čakata", "čakajo", "čaka"])} razvrstitev`;
      if (n === 0) n = null;
    }
    cleni.push({
      kljuc: kl,
      ime: IME_VERIGE[kl],
      skupina: SKUPINA[kl],
      stevilo: n,
      pretvorba: prej === null || n === null ? null : odstotek(n, prej),
      osnova: prej === null || n === null ? null : `od ${OD[prejIme as Exclude<KorakVerige, "prihodki">]}`,
      opomba,
    });
    if (n !== null) {
      prej = n;
      prejIme = kl;
    }
  }
  cleni.push({
    kljuc: "prihodki",
    ime: IME_VERIGE.prihodki,
    skupina: "Denar",
    stevilo: prihodki,
    pretvorba: null,
    osnova: null,
    opomba: k.aplikacija !== null && k.aplikacija > 0 ? `ločeno: ${eur(k.aplikacija)} v aplikaciji` : null,
  });

  // Največja izguba: najnižja pretvorba iz zadnjega člena s številom, ki ima vsaj NAJMANJ_ZA_OCENO podjetij
  let izguba: number | null = null;
  let najnizja = Infinity;
  let a: number | null = null;
  for (let i = 0; i < vrstni.length; i++) {
    const b = cleni[i].stevilo;
    if (b === null) continue;
    if (a !== null && a >= NAJMANJ_ZA_OCENO && b / a < najnizja) {
      najnizja = b / a;
      izguba = i;
    }
    a = b;
  }
  return { cleni, izguba, domene, nerazvrsceni };
}

/** Stavek povzetka iz verige (samo števila, brez priporočil). */
export function stavekVodstva(v: Veriga, brez: boolean, prvi: string | null): string {
  if (brez) return prvi ? `Pred ${lepDatum(prvi)} ni zapisov.` : "Zapisov še ni.";
  const [k, o] = v.cleni;
  const n = k.stevilo ?? 0;
  if (!n) return "V tem obdobju ni bilo prvič kontaktiranih podjetij.";
  const odz = o.stevilo ?? 0;
  const deli = [
    `${n} ${oblika(n, ["kontaktirano podjetje", "kontaktirani podjetji", "kontaktirana podjetja", "kontaktiranih podjetij"])} in ${odz} ${oblika(odz, ["odziv", "odziva", "odzivi", "odzivov"])}${odz ? ` (${o.pretvorba})` : ""}.`,
  ];
  const poz = v.cleni[2];
  const leadi = v.cleni[3].stevilo ?? 0;
  const posli = v.cleni[6].stevilo ?? 0;
  if (poz.stevilo) deli.push(`${poz.stevilo} ${oblika(poz.stevilo, ["pozitiven", "pozitivna", "pozitivni", "pozitivnih"])}`);
  if (v.nerazvrsceni) deli.push(`${v.nerazvrsceni} ${oblika(v.nerazvrsceni, ["odziv čaka", "odziva čakata", "odzivi čakajo", "odzivov čaka"])} razvrstitev`);
  if (posli) deli.push(`${posli} ${oblika(posli, ["posel", "posla", "posli", "poslov"])}`);
  else if (leadi) deli.push(`${leadi} ${oblika(leadi, ["lead", "leada", "leadi", "leadov"])}, poslov še ni`);
  else if (poz.stevilo) deli.push("leadov še ni");
  else if (odz) deli.push("prodajnih priložnosti še ni");
  const s = deli.length === 1 ? deli[0] : `${deli[0]} ${deli.slice(1).join(", ").replace(/^./, (c) => c.toUpperCase())}.`;
  // število ostane ob besedi (»7 odzivov« se ne prelomi)
  return s.replace(/(\d) /g, (_, d: string) => `${d} `);
}

// ——— marketing ———

export type MeraMarketinga = {
  kljuc: string;
  ime: string;
  /** Glavna vrednost kot besedilo (»99«, »8,1 %«, »N/A«). */
  vrednost: string;
  na: boolean;
  opis: string;
  /** Kaj odpre klik (seznam=…); brez = ni seznama. */
  cilj?: string;
};

/** Odzivi kohorte po Lukovi razvrstitvi; »rekli ne« brez razvrstitve šteje kot negativen (to je dejstvo, ne ocena). */
export function razvrstitevOdzivov(dogodki: Dogodek[], podjetja: Podjetja, domene: Iterable<string>) {
  const out = { pozitivni: 0, nevtralni: 0, negativni: 0, nerazvrsceni: 0 };
  for (const d of domene) {
    const r = podjetja[d]?.razvrstitev ?? "";
    if (r === "pozitiven") out.pozitivni++;
    else if (r === "nevtralen") out.nevtralni++;
    else if (r === "negativen" || jeNegativen(d, dogodki, podjetja)) out.negativni++;
    else out.nerazvrsceni++;
  }
  return out;
}

/** Stroški v obdobju (po datumu stroška) za kampanjo ali vse. */
function stroskiV(stroski: StrosekPregled[] | undefined, r: Razpon, kampanja: string | null): number | null {
  const v = (stroski ?? []).filter((s) => vRazponu(`${s.datum} 00:00`, r) && (!kampanja || s.kampanja === kampanja));
  return v.length ? v.reduce((a, s) => a + s.znesek, 0) : null;
}

/** Marketinške mere za obdobje: dejavnost po dogodkih, stopnje po kohorti (prvič kontaktirana v obdobju). */
export function mereMarketinga(k: {
  dogodki: Dogodek[];
  podjetja: Podjetja;
  r: Razpon;
  stroski: StrosekPregled[] | undefined;
  kampanja: string | null;
  nedostavljenih: number;
}): MeraMarketinga[] {
  const kohorta = kontaktirana(k.dogodki, k.r);
  const n = kohorta.size;
  const maili = k.dogodki.filter((e) => ["prvi", "follow_up", "video", "zadnji"].includes(e.korak) && vRazponu(e.cas, k.r)).length;
  const odzvani = new Set(k.dogodki.filter((e) => e.korak === "odgovor" && kohorta.has(e.domena)).map((e) => e.domena));
  const leadi = new Set(k.dogodki.filter((e) => e.korak === "lead" && kohorta.has(e.domena)).map((e) => e.domena)).size;
  const raz = razvrstitevOdzivov(k.dogodki, k.podjetja, odzvani);
  const o = odzvani.size;
  const strosek = stroskiV(k.stroski, k.r, k.kampanja);
  const cakajo = raz.nerazvrsceni ? `, ${raz.nerazvrsceni} ${oblika(raz.nerazvrsceni, ["čaka", "čakata", "čakajo", "čaka"])} razvrstitev` : "";
  return [
    { kljuc: "kontaktirana", ime: "Kontaktirana podjetja", vrednost: String(n), na: false, opis: "prvi stik v obdobju", cilj: "kontaktirana" },
    { kljuc: "maili", ime: "Poslani maili", vrednost: String(maili), na: false, opis: "prvi, follow-up, video in zadnji", cilj: "maili" },
    {
      kljuc: "nedostavljeni",
      ime: "Nedostavljeni",
      vrednost: k.nedostavljenih ? `${k.nedostavljenih} · ${odstotek(k.nedostavljenih, n)}` : "0",
      na: false,
      opis: "vrnjeni predstavitveni maili",
      cilj: "nedostavljeni",
    },
    { kljuc: "odprtja", ime: "Odprtja", vrednost: "N/A", na: true, opis: "ne merimo: brez sledilnega piksla (dostavljivost)" },
    { kljuc: "odzivi", ime: "Stopnja odziva", vrednost: n ? odstotek(o, n) : "–", na: !n, opis: `${o} od ${n} podjetij`, cilj: "veriga-odzivi" },
    {
      kljuc: "pozitivni",
      ime: "Pozitivni odzivi",
      vrednost: raz.pozitivni || !raz.nerazvrsceni ? (o ? odstotek(raz.pozitivni, o) : "–") : "N/A",
      na: !raz.pozitivni && !!raz.nerazvrsceni,
      opis: `${raz.pozitivni} od ${o} odzivov${cakajo}`,
      cilj: raz.nerazvrsceni ? "akcija-razvrstitev" : "veriga-pozitivni",
    },
    {
      kljuc: "negativni",
      ime: "Negativni odzivi",
      vrednost: o ? odstotek(raz.negativni, o) : "–",
      na: !o,
      opis: `${raz.negativni} od ${o} odzivov (rekli so ne)`,
    },
    { kljuc: "leadi", ime: "Kvalificirani leadi", vrednost: String(leadi), na: false, opis: "»da« konkretnemu koraku", cilj: "veriga-leadi" },
    {
      kljuc: "cpl",
      ime: "Cena na lead",
      vrednost: strosek === null ? "N/A" : leadi ? eur(strosek / leadi) : "N/A",
      na: strosek === null || !leadi,
      opis: strosek === null ? "stroški kampanj niso vpisani" : leadi ? `${eur(strosek)} stroškov / ${leadi} leadov` : `${eur(strosek)} stroškov, leadov še ni`,
    },
    {
      kljuc: "konverzija",
      ime: "Marketinška konverzija",
      vrednost: n ? odstotek(leadi, n) : "–",
      na: !n,
      opis: "od kontakta do leada",
    },
  ];
}

// ——— kampanje (različice prvega maila) in produkti ———

export type VrsticaKampanje = {
  kampanja: string;
  ime: string;
  kontaktirana: number;
  nedostavljeni: number;
  odzivi: number;
  pozitivni: number;
  leadi: number;
  sestanki: number;
  posli: number;
  prihodki: number | null;
  strosek: number | null;
  cpl: number | null;
  /** Premalo podjetij za primerjavo (manj kot NAJMANJ_ZA_OCENO). */
  premalo: boolean;
};

/** Kampanje po prvem stiku: kohorta obdobja po različici prvega maila in kaj je iz nje nastalo do danes. */
export function kampanjeAnaliza(k: {
  dogodki: Dogodek[];
  podjetja: Podjetja;
  posli: PoselVrednost[];
  stroski: StrosekPregled[] | undefined;
  r: Razpon;
}): VrsticaKampanje[] {
  const kohorta = kontaktirana(k.dogodki, k.r);
  const skupine = new Map<string, Set<string>>();
  for (const d of kohorta) {
    const kam = k.podjetja[d]?.kampanja || NI_ZAPISANO;
    if (!skupine.has(kam)) skupine.set(kam, new Set());
    skupine.get(kam)!.add(d);
  }
  const imaKorak = (korak: string, dom: Set<string>) => new Set(k.dogodki.filter((e) => e.korak === korak && dom.has(e.domena)).map((e) => e.domena)).size;
  return [...skupine.entries()]
    .map(([kam, dom]) => {
      const odz = new Set(k.dogodki.filter((e) => e.korak === "odgovor" && dom.has(e.domena)).map((e) => e.domena));
      const posli = k.posli.filter((p) => dom.has(p.domena));
      const vr = posli.map(pogodbenaVrednost).filter((v): v is number => v !== null);
      const strosek = kam === NI_ZAPISANO ? null : stroskiV(k.stroski, k.r, kam);
      const leadi = imaKorak("lead", dom);
      return {
        kampanja: kam,
        ime: kam === NI_ZAPISANO ? "Ni zapisano" : kam,
        kontaktirana: dom.size,
        nedostavljeni: [...dom].filter((d) => k.podjetja[d]?.stanje === "nedostavljeno").length,
        odzivi: odz.size,
        pozitivni: [...odz].filter((d) => k.podjetja[d]?.razvrstitev === "pozitiven").length,
        leadi,
        sestanki: imaKorak("sestanek", dom),
        posli: imaKorak("posel", dom),
        prihodki: vr.length ? vr.reduce((a, b) => a + b, 0) : posli.length ? null : 0,
        strosek,
        cpl: strosek !== null && leadi ? strosek / leadi : null,
        premalo: dom.size < NAJMANJ_ZA_OCENO,
      };
    })
    .sort((a, b) => Number(a.premalo) - Number(b.premalo) || b.kontaktirana - a.kontaktirana || a.ime.localeCompare(b.ime));
}

export type VrsticaProdukta = {
  produkt: string;
  ime: string;
  kontaktirana: number;
  odzivi: number;
  pozitivni: number;
  leadi: number;
  sestanki: number;
  posli: number;
  /** Pogodbena vrednost poslov iz lijaka v obdobju. */
  prihodki: number | null;
  /** Opravljeni nalogi v aplikaciji v obdobju (spremstvo, fizično varovanje); null = ni povezave ali ni tega produkta. */
  aplikacija: number | null;
  /** Podjetja na seznamu kampanje, še nekontaktirana. */
  naSeznamu: number;
  /** Kratko stanje, kadar kampanje še ni (»kampanje še ni«, »12 na seznamu, še ni poslano«). */
  stanje: string | null;
};

/** Vrsta naloga v aplikaciji → produkt (escort = Escort, static = fizično varovanje; Luka 7. 11.). */
export const PRODUKT_NALOGA: Record<string, string> = { escort: "spremstvo", static: "varovanje" };

/** Primerjava produktov: dogodki vseh produktov (drugi filtri veljajo), posli iz lijaka in aplikacija ločeno. */
export function produktiAnaliza(k: {
  dogodki: Dogodek[];
  podjetja: Podjetja;
  posli: PoselVrednost[];
  seznami: Record<string, number>;
  nalogi: NalogAplikacije[] | null;
  r: Razpon;
}): VrsticaProdukta[] {
  const kohorta = kontaktirana(k.dogodki, k.r);
  const vrstice: VrsticaProdukta[] = Object.keys(IME_PRODUKTA).map((pr) => {
    const ev = k.dogodki.filter((e) => e.produkt === pr);
    const dom = new Set([...kohorta].filter((d) => ev.some((e) => e.domena === d)));
    const ima = (korak: string) => new Set(ev.filter((e) => e.korak === korak && dom.has(e.domena)).map((e) => e.domena));
    const odz = ima("odgovor");
    const posli = k.posli.filter((p) => p.produkt === pr && vRazponu(`${p.datum} 00:00`, k.r));
    const vr = posli.map(pogodbenaVrednost).filter((v): v is number => v !== null);
    const nalogi = k.nalogi ? k.nalogi.filter((n) => PRODUKT_NALOGA[n.vrsta] === pr && vRazponu(`${n.datum} 00:00`, k.r)) : null;
    const znani = nalogi?.filter((n) => n.znesek !== null) ?? [];
    const naSeznamu = k.seznami[pr] ?? 0;
    return {
      produkt: pr,
      ime: IME_PRODUKTA[pr],
      kontaktirana: dom.size,
      odzivi: odz.size,
      pozitivni: [...odz].filter((d) => k.podjetja[d]?.razvrstitev === "pozitiven").length,
      leadi: ima("lead").size,
      sestanki: ima("sestanek").size,
      posli: ima("posel").size,
      prihodki: vr.length ? vr.reduce((a, b) => a + b, 0) : posli.length ? null : 0,
      aplikacija: !nalogi || !Object.values(PRODUKT_NALOGA).includes(pr) ? null : znani.reduce((a, n) => a + (n.znesek as number), 0),
      naSeznamu,
      stanje: ev.length ? null : naSeznamu ? `${naSeznamu} na seznamu, še ni poslano` : "kampanje še ni",
    };
  });
  return vrstice;
}

// ——— faze prodaje, kanban, izgubljeni ———

export type StopnjaProdaje = {
  kljuc: FazaProdaje;
  ime: string;
  /** Priložnosti, ki so zdaj v tej fazi. */
  zdaj: number;
  /** Priložnosti, ki so prišle do te faze ali dlje (pri izgubljenih: vse izgubljene). */
  doslej: number;
  /** Iz prejšnje faze v to (»40 %«); prva faza in izgubljeno: null. */
  pretvorba: string | null;
  /** Vrednost v prvem letu priložnosti v tej fazi; null = nobena nima vpisane vrednosti. */
  vrednost: number | null;
  brezVrednosti: number;
  /** Povprečno dni v trenutni fazi (odprte); null brez priložnosti ali brez časa. */
  dni: number | null;
  /** Odprte z naslednjim korakom in koliko jih zamuja. */
  zNaslednjim: number;
  zamuja: number;
};

/** Kohorta priložnosti: odprte (ustvarjene) v obdobju. */
export function priloznostiObdobja(prl: PriloznostPregled[], r: Razpon): PriloznostPregled[] {
  return prl.filter((o) => vRazponu(o.ustvarjen, r));
}

export function stopnjeProdaje(prl: PriloznostPregled[], danes: string): StopnjaProdaje[] {
  let prej: number | null = null;
  return FAZE_PRODAJE.map((f) => {
    const v = prl.filter((o) => o.faza === f.kljuc);
    const doslej = f.kljuc === "izgubljeno" ? v.length : prl.filter((o) => najdlje(o) >= RED[f.kljuc]).length;
    const vrednosti = v.map(letnaVrednost).filter((x): x is number => x !== null);
    const odprta = ODPRTE_FAZE.includes(f.kljuc);
    const dni = odprta
      ? v.map((o) => vstopVFazo(o)).filter((c): c is string => !!c).map((c) => dniMed(c.slice(0, 10), danes))
      : [];
    const out: StopnjaProdaje = {
      kljuc: f.kljuc,
      ime: f.ime,
      zdaj: v.length,
      doslej,
      pretvorba: f.kljuc === "izgubljeno" || prej === null ? null : odstotek(doslej, prej),
      vrednost: vrednosti.length ? vrednosti.reduce((a, b) => a + b, 0) : v.length ? null : 0,
      brezVrednosti: v.length - vrednosti.length,
      dni: dni.length ? Math.round(dni.reduce((a, b) => a + b, 0) / dni.length) : null,
      zNaslednjim: odprta ? v.filter((o) => o.naslednji).length : 0,
      zamuja: odprta ? v.filter((o) => o.naslednji && o.naslednjiKdaj && o.naslednjiKdaj < danes).length : 0,
    };
    if (f.kljuc !== "izgubljeno") prej = doslej;
    return out;
  });
}

export type KarticaKanbana = {
  id: number;
  domena: string;
  ime: string;
  faza: FazaProdaje;
  produkt: string;
  vrednost: string;
  letna: number | null;
  lastnik: string;
  zadnja: string | null;
  naslednji: string;
  naslednjiKdaj: string;
  zamuja: boolean;
  verjetnost: number | null;
  zakljucek: string;
  dni: number | null;
  zastala: boolean;
  razlog: string;
  konkurent: string;
};

/** Kartice kanbana (stanje danes): odprte vse, zaključene zadnjih 30 dni; najstarejši naslednji korak najprej. */
export function kanban(prl: PriloznostPregled[], podjetja: Podjetja, dogodki: Dogodek[], danes: string): Record<FazaProdaje, KarticaKanbana[]> {
  const zadnji = zadnjiDanPodjetij(dogodki);
  const meja = premakniDan(danes, -30);
  const out = Object.fromEntries(FAZE_PRODAJE.map((f) => [f.kljuc, [] as KarticaKanbana[]])) as Record<FazaProdaje, KarticaKanbana[]>;
  for (const o of prl) {
    const odprta = ODPRTE_FAZE.includes(o.faza);
    const vstop = vstopVFazo(o);
    if (!odprta && (vstop ?? "").slice(0, 10) < meja) continue;
    const z = zadnjaAktivnost(o, zadnji);
    out[o.faza].push({
      id: o.id,
      domena: o.domena,
      ime: kratkoIme(podjetja[o.domena]?.podjetje, o.domena),
      faza: o.faza,
      produkt: IME_PRODUKTA[o.produkt] ?? o.produkt,
      vrednost: opisVrednosti(o),
      letna: letnaVrednost(o),
      lastnik: o.lastnik,
      zadnja: z,
      naslednji: o.naslednji,
      naslednjiKdaj: o.naslednjiKdaj,
      zamuja: odprta && !!o.naslednji && !!o.naslednjiKdaj && o.naslednjiKdaj < danes,
      verjetnost: o.verjetnost,
      zakljucek: o.zakljucek,
      dni: vstop ? dniMed(vstop.slice(0, 10), danes) : null,
      zastala: odprta && !!z && dniMed(z, danes) >= ZASTALA_DNI,
      razlog: o.razlog,
      konkurent: o.konkurent,
    });
  }
  for (const f of FAZE_PRODAJE) {
    out[f.kljuc].sort((a, b) => (a.naslednjiKdaj || "9999").localeCompare(b.naslednjiKdaj || "9999") || a.ime.localeCompare(b.ime));
  }
  return out;
}

export type SkupinaIzgube = { kljuc: string; ime: string; stevilo: number; vrednost: number | null };

export type Izgubljeni = {
  stevilo: number;
  vrednost: number | null;
  poRazlogu: SkupinaIzgube[];
  poProduktu: SkupinaIzgube[];
  poKampanji: SkupinaIzgube[];
  konkurenti: SkupinaIzgube[];
};

function skupine(v: PriloznostPregled[], kljuc: (o: PriloznostPregled) => string, ime: (k: string) => string): SkupinaIzgube[] {
  const m = new Map<string, PriloznostPregled[]>();
  for (const o of v) {
    const k = kljuc(o);
    if (!k) continue;
    m.set(k, [...(m.get(k) ?? []), o]);
  }
  return [...m.entries()]
    .map(([k, x]) => {
      const vr = x.map(letnaVrednost).filter((z): z is number => z !== null);
      return { kljuc: k, ime: ime(k), stevilo: x.length, vrednost: vr.length ? vr.reduce((a, b) => a + b, 0) : null };
    })
    .sort((a, b) => b.stevilo - a.stevilo || a.ime.localeCompare(b.ime));
}

/** Izgubljeni posli po razlogu, produktu, kampanji in konkurentu (kohorta obdobja). */
export function izgubljeni(prl: PriloznostPregled[]): Izgubljeni {
  const v = prl.filter((o) => o.faza === "izgubljeno");
  const vr = v.map(letnaVrednost).filter((z): z is number => z !== null);
  return {
    stevilo: v.length,
    vrednost: vr.length ? vr.reduce((a, b) => a + b, 0) : null,
    poRazlogu: skupine(v, (o) => o.razlog || "ni-zapisan", (k) => RAZLOGI_IZGUBE[k] ?? "Ni zapisan"),
    poProduktu: skupine(v, (o) => o.produkt, (k) => IME_PRODUKTA[k] ?? k),
    poKampanji: skupine(v, (o) => o.kampanja || NI_ZAPISANO, (k) => (k === NI_ZAPISANO ? "Ni zapisano" : k)),
    konkurenti: skupine(v, (o) => o.konkurent.trim(), (k) => k),
  };
}

/** Priložnosti kot vrstice predala (ena na priložnost, čas vstopa v fazo). */
export function priloznostiZaPredal(prl: PriloznostPregled[], danes: string): Dogodek[] {
  return prl.map((o) => {
    const vstop = vstopVFazo(o);
    const deli = [
      opisVrednosti(o),
      o.verjetnost !== null ? `verjetnost ${o.verjetnost} %` : "",
      o.zakljucek ? `zaključek ${lepDatum(o.zakljucek)}` : "",
      o.faza === "izgubljeno" ? `razlog: ${RAZLOGI_IZGUBE[o.razlog] ?? "ni zapisan"}${o.konkurent ? `, ${o.konkurent}` : ""}` : "",
      ODPRTE_FAZE.includes(o.faza) && vstop ? `${dniMed(vstop.slice(0, 10), danes)} dni v fazi` : "",
    ].filter(Boolean);
    return {
      cas: vstop,
      korak: o.faza === "dobljeno" ? "posel" : o.faza === "sestanek" ? "sestanek" : "lead",
      domena: o.domena,
      produkt: o.produkt,
      oznaka: `${IME_FAZE_PRODAJE[o.faza]} · ${IME_PRODUKTA[o.produkt] ?? o.produkt}`,
      razlog: deli.join(" · "),
    };
  });
}

// ——— napoved in cilji ———

export type Napoved = {
  odprtih: number;
  /** Vrednost odprtih priložnosti v prvem letu; null = nobena nima vrednosti. */
  potencial: number | null;
  /** Vrednost × verjetnost (samo priložnosti z obema); null = nobena nima verjetnosti. */
  ponderirano: number | null;
  brezVrednosti: number;
  brezVerjetnosti: number;
  /** Po mesecu pričakovanega zaključka (ponderirano); brez datuma posebej. */
  poMesecih: { mesec: string; oznaka: string; potencial: number; ponderirano: number | null; stevilo: number }[];
  brezDatuma: number;
};

export function napoved(prl: PriloznostPregled[]): Napoved {
  const odprte = prl.filter((o) => ODPRTE_FAZE.includes(o.faza));
  const zVrednostjo = odprte.filter((o) => letnaVrednost(o) !== null);
  const zObema = zVrednostjo.filter((o) => o.verjetnost !== null);
  const meseci = new Map<string, PriloznostPregled[]>();
  for (const o of odprte) {
    if (!o.zakljucek) continue;
    const m = o.zakljucek.slice(0, 7);
    meseci.set(m, [...(meseci.get(m) ?? []), o]);
  }
  return {
    odprtih: odprte.length,
    potencial: zVrednostjo.length ? zVrednostjo.reduce((a, o) => a + (letnaVrednost(o) as number), 0) : null,
    ponderirano: zObema.length ? zObema.reduce((a, o) => a + ((letnaVrednost(o) as number) * (o.verjetnost as number)) / 100, 0) : null,
    brezVrednosti: odprte.length - zVrednostjo.length,
    brezVerjetnosti: zVrednostjo.length - zObema.length,
    poMesecih: [...meseci.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, v]) => {
        const z = v.filter((o) => letnaVrednost(o) !== null && o.verjetnost !== null);
        return {
          mesec: m,
          oznaka: `${MESECI_KRATKO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`,
          potencial: v.reduce((a, o) => a + (letnaVrednost(o) ?? 0), 0),
          ponderirano: z.length ? z.reduce((a, o) => a + ((letnaVrednost(o) as number) * (o.verjetnost as number)) / 100, 0) : null,
          stevilo: v.length,
        };
      }),
    brezDatuma: odprte.filter((o) => !o.zakljucek).length,
  };
}

export const MERE_CILJEV: { kljuc: string; ime: string; denar?: boolean }[] = [
  { kljuc: "kontaktirana", ime: "Kontaktirana podjetja" },
  { kljuc: "odzivi", ime: "Odzivi" },
  { kljuc: "pozitivni", ime: "Pozitivni odzivi" },
  { kljuc: "leadi", ime: "Leadi" },
  { kljuc: "sestanki", ime: "Sestanki" },
  { kljuc: "ponudbe", ime: "Ponudbe" },
  { kljuc: "posli", ime: "Posli" },
  { kljuc: "prihodki", ime: "Prihodki (realizirano, vsi viri)", denar: true },
];

/** Obdobja ciljev za dan: ta mesec, ta kvartal, to leto (ključ kot v Harveyju in razpon). */
export function obdobjaCiljev(danes: string): { kljuc: string; ime: string; od: string; do: string }[] {
  const y = Number(danes.slice(0, 4));
  const m = Number(danes.slice(5, 7));
  const q = Math.floor((m - 1) / 3) + 1;
  const konecMeseca = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const mm = String(m).padStart(2, "0");
  return [
    { kljuc: `${y}-${mm}`, ime: `${MESECI_KRATKO[m - 1]} ${y}`, od: `${y}-${mm}-01`, do: konecMeseca(y, m) },
    { kljuc: `${y}-Q${q}`, ime: `${q}. kvartal ${y}`, od: `${y}-${String(q * 3 - 2).padStart(2, "0")}-01`, do: konecMeseca(y, q * 3) },
    { kljuc: `${y}`, ime: `leto ${y}`, od: `${y}-01-01`, do: `${y}-12-31` },
  ];
}

export type CeliCilj = { mera: string; ime: string; denar: boolean; obdobja: { kljuc: string; dosezeno: number | null; cilj: number | null; delez: number | null }[] };

/**
 * Doseženo proti ciljem za ta mesec, kvartal in leto (ne glede na izbrano obdobje). Doseženo: dogodki v razponu
 * (podjetja enkrat), ponudbe po vstopu v fazo, prihodki realizirani (posli iz lijaka po mesecih + aplikacija).
 */
export function dosezenoCiljev(k: {
  cilji: CiljPregled[] | undefined;
  dogodki: Dogodek[];
  podjetja: Podjetja;
  priloznosti: PriloznostPregled[];
  prihodek: (od: string, d: string) => number | null;
  danes: string;
}): { obdobja: ReturnType<typeof obdobjaCiljev>; mere: CeliCilj[]; nastavljenih: number } {
  const obd = obdobjaCiljev(k.danes);
  const vsi = k.cilji ?? [];
  const mere = MERE_CILJEV.map((m) => ({
    mera: m.kljuc,
    ime: m.ime,
    denar: !!m.denar,
    obdobja: obd.map((o) => {
      const r = { od: o.od, do: o.do };
      let dosezeno: number | null;
      switch (m.kljuc) {
        case "kontaktirana":
          dosezeno = kontaktirana(k.dogodki, r).size;
          break;
        case "odzivi":
          dosezeno = enaNaPodjetje(k.dogodki, "odgovor", r).size;
          break;
        case "pozitivni":
          dosezeno = [...enaNaPodjetje(k.dogodki, "odgovor", r)].filter((d) => k.podjetja[d]?.razvrstitev === "pozitiven").length;
          break;
        case "leadi":
          dosezeno = enaNaPodjetje(k.dogodki, "lead", r).size;
          break;
        case "sestanki":
          dosezeno = enaNaPodjetje(k.dogodki, "sestanek", r).size;
          break;
        case "ponudbe":
          dosezeno = k.priloznosti.filter((p) => p.faze.some((f) => f.faza === "ponudba" && vRazponu(f.cas, r))).length;
          break;
        case "posli":
          dosezeno = enaNaPodjetje(k.dogodki, "posel", r).size;
          break;
        default:
          dosezeno = k.prihodek(o.od, o.do);
      }
      const c = vsi.find((x) => x.obdobje === o.kljuc && x.mera === m.kljuc)?.vrednost ?? null;
      return { kljuc: o.kljuc, dosezeno, cilj: c, delez: c && dosezeno !== null ? (dosezeno / c) * 100 : null };
    }),
  }));
  return { obdobja: obd, mere, nastavljenih: vsi.length };
}

// ——— prihodki po mesecih (realizirano) in stranke v aplikaciji ———

export type MesecPrihodkov = {
  mesec: string;
  oznaka: string;
  od: string;
  do: string;
  /** Aplikacija po vrsti naloga (samo z znano ceno) in nalogi brez cene. */
  spremstvo: number;
  varovanje: number;
  ostalo: number;
  brezCene: number;
  nalogov: number;
  /** Posli iz lijaka, realizirano: enkratni v mesecu sklenitve, ponavljajoči vsak aktiven mesec. */
  lijak: number;
  /** Mesec je pred današnjim mesecem, današnji ali prihodnji. */
  prihodnji: boolean;
  /** Prihodnji mesec: potrjeno iz pogodb (ponavljajoči posli). */
  potrjeno: number;
  /** Cilj prihodkov za mesec (Luka); null = cilja ni. */
  cilj: number | null;
};

function konecMeseca(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
}
function plusMesec(m: string, n: number): string {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Prihodek posla v mesecu (realizirano ali potrjeno naprej). */
export function prihodekPoslaVMesecu(p: PoselVrednost, mesec: string): number {
  const od = `${mesec}-01`;
  const d = konecMeseca(mesec);
  if (p.vrsta === "enkratno") return p.datum >= od && p.datum <= d ? p.znesek : 0;
  if (p.zacetek > d) return 0;
  if (p.trajanje) {
    const [y, m, dan] = p.zacetek.split("-").map(Number);
    const konec = new Date(Date.UTC(y, m - 1 + p.trajanje, dan)).toISOString().slice(0, 10);
    if (konec <= od) return 0;
  }
  return p.vrsta === "mesecno" ? p.znesek : p.znesek / 12;
}

/**
 * Prihodki po mesecih: od prvega meseca z zapisom (največ 12 nazaj) do 3 mesece naprej. Aplikacija samo,
 * kadar je vključena (filter produkta jo omeji, kampanja in oseba jo izključita, ker ni pripisana kampanjam).
 */
export function prihodkiPoMesecih(k: {
  posli: PoselVrednost[];
  nalogi: NalogAplikacije[] | null;
  aplikacijaVkljucena: (vrsta: string) => boolean;
  cilji: CiljPregled[] | undefined;
  danes: string;
}): MesecPrihodkov[] {
  const zdaj = k.danes.slice(0, 7);
  const prviApp = (k.nalogi ?? []).reduce<string | null>((a, n) => (!a || n.datum < a ? n.datum : a), null)?.slice(0, 7);
  const prviPosel = k.posli.reduce<string | null>((a, p) => (!a || p.datum < a ? p.datum : a), null)?.slice(0, 7);
  // od prvega meseca z zapisom (prej ni podatkov, ne ničel), največ 12 mesecev nazaj; brez zapisov zadnjih 6
  let zacetek = [prviApp, prviPosel].filter((x): x is string => !!x).sort()[0] ?? plusMesec(zdaj, -5);
  if (zacetek < plusMesec(zdaj, -11)) zacetek = plusMesec(zdaj, -11);
  const out: MesecPrihodkov[] = [];
  for (let m = zacetek; m <= plusMesec(zdaj, 3); m = plusMesec(m, 1)) {
    const prihodnji = m > zdaj;
    const nal = prihodnji ? [] : (k.nalogi ?? []).filter((n) => n.datum.startsWith(m) && k.aplikacijaVkljucena(n.vrsta));
    const vsota = (vr: (v: string) => boolean) => nal.filter((n) => vr(n.vrsta) && n.znesek !== null).reduce((a, n) => a + (n.znesek as number), 0);
    const lijak = k.posli.reduce((a, p) => a + prihodekPoslaVMesecu(p, m), 0);
    out.push({
      mesec: m,
      oznaka: `${MESECI_KRATKO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`,
      od: `${m}-01`,
      do: konecMeseca(m),
      spremstvo: vsota((v) => v === "escort"),
      varovanje: vsota((v) => v === "static"),
      ostalo: vsota((v) => v !== "escort" && v !== "static"),
      brezCene: nal.filter((n) => n.znesek === null).length,
      nalogov: nal.length,
      lijak: prihodnji ? 0 : lijak,
      prihodnji,
      potrjeno: prihodnji ? lijak : 0,
      cilj: (k.cilji ?? []).find((c) => c.obdobje === m && c.mera === "prihodki")?.vrednost ?? null,
    });
  }
  return out;
}

export type StrankeAplikacije = {
  na: string | null;
  stranke: number;
  /** Stranke z nalogi v vsaj dveh različnih mesecih (do konca obdobja). */
  vracajoce: number;
  /** Delež prihodkov treh največjih strank v obdobju (0–100); null brez prihodkov. */
  top3: number | null;
  /** Prihodki v obdobju od strank, ki so v tem mesecu naročile prvič, in od tistih, ki so že naročale. */
  nove: number;
  obstojece: number;
  brezImena: number;
};

/** Stranke v aplikaciji (po zapisanem imenu brez pravne oblike; imena strani ne vidi, samo ključ). */
export function strankeAplikacije(nalogi: NalogAplikacije[] | null, napaka: string | null, r: Razpon, konec: string): StrankeAplikacije {
  if (!nalogi) return { na: napaka ?? "Povezava z aplikacijo ni nastavljena.", stranke: 0, vracajoce: 0, top3: null, nove: 0, obstojece: 0, brezImena: 0 };
  const doKonca = nalogi.filter((n) => n.datum <= konec);
  const prviMesec = new Map<string, string>();
  const meseci = new Map<string, Set<string>>();
  for (const n of doKonca) {
    if (!n.stranka) continue;
    const m = n.datum.slice(0, 7);
    if (!prviMesec.has(n.stranka) || m < prviMesec.get(n.stranka)!) prviMesec.set(n.stranka, m);
    if (!meseci.has(n.stranka)) meseci.set(n.stranka, new Set());
    meseci.get(n.stranka)!.add(m);
  }
  const v = nalogi.filter((n) => vRazponu(`${n.datum} 00:00`, r));
  const poStranki = new Map<string, number>();
  let nove = 0;
  let obstojece = 0;
  for (const n of v) {
    if (!n.stranka || n.znesek === null) continue;
    poStranki.set(n.stranka, (poStranki.get(n.stranka) ?? 0) + n.znesek);
    if (prviMesec.get(n.stranka) === n.datum.slice(0, 7)) nove += n.znesek;
    else obstojece += n.znesek;
  }
  const zneski = [...poStranki.values()].sort((a, b) => b - a);
  const skupaj = zneski.reduce((a, b) => a + b, 0);
  const stranke = new Set(v.map((n) => n.stranka).filter(Boolean));
  return {
    na: null,
    stranke: stranke.size,
    vracajoce: [...stranke].filter((s) => (meseci.get(s as string)?.size ?? 0) >= 2).length,
    top3: skupaj ? (zneski.slice(0, 3).reduce((a, b) => a + b, 0) / skupaj) * 100 : null,
    nove,
    obstojece,
    brezImena: v.filter((n) => !n.stranka).length,
  };
}

// ——— časovni graf in toplotna karta ———

export const MERE_CASA = [
  { kljuc: "kontaktirana", ime: "Kontaktirana", vrsta: "aktivnost" },
  { kljuc: "maili", ime: "Maili", vrsta: "aktivnost" },
  { kljuc: "klici", ime: "Klici", vrsta: "aktivnost" },
  { kljuc: "odzivi", ime: "Odzivi", vrsta: "rezultat" },
  { kljuc: "leadi", ime: "Leadi", vrsta: "rezultat" },
  { kljuc: "sestanki", ime: "Sestanki", vrsta: "rezultat" },
  { kljuc: "posli", ime: "Posli", vrsta: "rezultat" },
] as const;
export type MeraCasa = (typeof MERE_CASA)[number]["kljuc"];

export type TockaCasa = { od: string; do: string; oznaka: string; vrednosti: Record<MeraCasa, number>; prej: Record<MeraCasa, number> | null };

const MAILI = new Set(["prvi", "follow_up", "video", "zadnji"]);

function prestej(dogodki: Dogodek[], prvi: Map<string, string | null>, od: string, d: string): Record<MeraCasa, number> {
  const v = (e: Dogodek) => !!e.cas && e.cas.slice(0, 10) >= od && e.cas.slice(0, 10) <= d;
  const podjetja = (k: string) => new Set(dogodki.filter((e) => e.korak === k && v(e)).map((e) => e.domena)).size;
  let kontakt = 0;
  for (const c of prvi.values()) if (c && c.slice(0, 10) >= od && c.slice(0, 10) <= d) kontakt++;
  return {
    kontaktirana: kontakt,
    maili: dogodki.filter((e) => MAILI.has(e.korak) && v(e)).length,
    klici: dogodki.filter((e) => e.korak === "klic" && v(e)).length,
    odzivi: podjetja("odgovor"),
    leadi: podjetja("lead"),
    sestanki: podjetja("sestanek"),
    posli: podjetja("posel"),
  };
}

/**
 * Uspešnost skozi čas: po dnevih (obdobje do 45 dni) ali tednih (pon–ned). »Vse« od prvega zapisa. Prejšnje obdobje
 * (za primerjavo) je enako razdeljeno in poravnano po vrsti (1. dan s 1. dnem).
 */
export function casovnaVrsta(dogodki: Dogodek[], r: Razpon, prej: Razpon, prviZapis: string | null, danes: string, prviKontakti: Map<string, string | null>): { tocke: TockaCasa[]; poDnevih: boolean } {
  const od = r?.od ?? prviZapis ?? danes;
  const doo = r ? (r.do > danes ? danes : r.do) : danes;
  if (od > doo) return { tocke: [], poDnevih: true };
  const dolzina = dniMed(od, doo) + 1;
  const poDnevih = dolzina <= 45;
  const vedra: { od: string; do: string }[] = [];
  if (poDnevih) for (let i = 0; i < dolzina; i++) vedra.push({ od: premakniDan(od, i), do: premakniDan(od, i) });
  else for (let t = ponedeljek(od); t <= doo; t = premakniDan(t, 7)) vedra.push({ od: t < od ? od : t, do: premakniDan(t, 6) > doo ? doo : premakniDan(t, 6) });
  const zamik = prej ? dniMed(prej.od, od) : 0;
  return {
    poDnevih,
    tocke: vedra.map((b) => {
      const [, m, d] = b.od.split("-").map(Number);
      return {
        od: b.od,
        do: b.do,
        oznaka: `${d}. ${m}.`,
        vrednosti: prestej(dogodki, prviKontakti, b.od, b.do),
        prej: prej ? prestej(dogodki, prviKontakti, premakniDan(b.od, -zamik), premakniDan(b.do, -zamik)) : null,
      };
    }),
  };
}

export type CelicaToplote = { dan: string; aktivnosti: number; odzivi: number; prihodnji: boolean; predZapisi: boolean };

/** Toplotna karta: tedni (pon–ned) od tedna prvega zapisa do tega tedna (največ 12), aktivnosti = maili + klici. */
export function toplotnaKarta(dogodki: Dogodek[], danes: string, prviZapis: string | null, tednov = 12): CelicaToplote[][] {
  const konec = ponedeljek(danes);
  let zacetek = premakniDan(konec, -7 * (tednov - 1));
  if (prviZapis && ponedeljek(prviZapis) > zacetek) zacetek = ponedeljek(prviZapis);
  const aktivnosti = new Map<string, number>();
  const odzivi = new Map<string, number>();
  for (const e of dogodki) {
    if (!e.cas) continue;
    const d = e.cas.slice(0, 10);
    if (MAILI.has(e.korak) || e.korak === "klic") aktivnosti.set(d, (aktivnosti.get(d) ?? 0) + 1);
    if (e.korak === "odgovor") odzivi.set(d, (odzivi.get(d) ?? 0) + 1);
  }
  const out: CelicaToplote[][] = [];
  for (let t = zacetek; t <= konec; t = premakniDan(t, 7)) {
    out.push(
      Array.from({ length: 7 }, (_, i) => {
        const dan = premakniDan(t, i);
        return { dan, aktivnosti: aktivnosti.get(dan) ?? 0, odzivi: odzivi.get(dan) ?? 0, prihodnji: dan > danes, predZapisi: !!prviZapis && dan < prviZapis };
      }),
    );
  }
  return out;
}

// ——— »Kaj moramo narediti« po fazah in »Kaj se dogaja?« ———

export type AkcijaProdajeKljuc = "razvrstitev" | "pozitivni" | "kvalificirani" | "ponudbe" | "pogajanja" | "zastale";
export type AkcijaProdaje = Omit<Akcija, "kljuc"> & { kljuc: AkcijaProdajeKljuc };

const PREDLOG: Record<string, string> = {
  pozitiven: "predlog: pozitiven (dogovorjen sestanek)",
  nevtralen: "predlog: nevtralen (pošljite mail ali pokličite kasneje)",
  negativen: "predlog: negativen (rekli so ne)",
};

/**
 * Odzivi brez Lukove razvrstitve, ena vrstica na podjetje (prvi odziv), s predlogom iz izida klica. Podjetja, ki so
 * rekla ne, niso tu: to je njihov odgovor, ne naša ocena (razvrstitev se jim lahko spremeni na kartici podjetja).
 */
export function odziviZaRazvrstitev(dogodki: Dogodek[], podjetja: Podjetja): Dogodek[] {
  const videno = new Set<string>();
  return dogodki
    .filter((e) => e.korak === "odgovor")
    .sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""))
    .filter((e) => !podjetja[e.domena]?.razvrstitev && !jeNegativen(e.domena, dogodki, podjetja))
    .filter((e) => (videno.has(e.domena) ? false : (videno.add(e.domena), true)))
    .map((e) => ({ ...e, razlog: e.predlog ? PREDLOG[e.predlog] : "predloga ni (odgovor po mailu, preberi ga)" }));
}

/** Prodajne skupine »Kaj moramo narediti« (stanje danes): razvrstitev odzivov in odprte priložnosti po fazah. */
export function akcijeProdaje(dogodki: Dogodek[], podjetja: Podjetja, prl: PriloznostPregled[], danes: string): AkcijaProdaje[] {
  const zadnji = zadnjiDanPodjetij(dogodki);
  const vrstica = (o: PriloznostPregled, razlog: string): Dogodek => ({
    cas: vstopVFazo(o),
    korak: "lead",
    domena: o.domena,
    produkt: o.produkt,
    oznaka: `${IME_FAZE_PRODAJE[o.faza]} · ${opisVrednosti(o)}`,
    razlog,
  });
  const korak = (o: PriloznostPregled) =>
    o.naslednji ? `Naslednje: ${o.naslednji}${o.naslednjiKdaj ? `, ${lepDatum(o.naslednjiKdaj)}${o.naslednjiKdaj < danes ? " (zamuja)" : ""}` : ""}` : "Naslednji korak ni vpisan";
  const dni = (o: PriloznostPregled) => {
    const v = vstopVFazo(o);
    return v ? dniMed(v.slice(0, 10), danes) : null;
  };
  const vFazi = (f: FazaProdaje) => prl.filter((o) => o.faza === f);
  const zastale = prl
    .filter((o) => ODPRTE_FAZE.includes(o.faza))
    .map((o) => ({ o, z: zadnjaAktivnost(o, zadnji) }))
    .filter(({ z }) => !!z && dniMed(z, danes) >= ZASTALA_DNI)
    .sort((a, b) => (a.z ?? "").localeCompare(b.z ?? ""));
  return [
    {
      kljuc: "razvrstitev",
      ime: "Odzivi brez razvrstitve",
      opis: "Pozitiven, nevtralen ali negativen: odločiš ti.",
      prazno: "Vsi odzivi so razvrščeni.",
      vrstice: odziviZaRazvrstitev(dogodki, podjetja),
    },
    {
      kljuc: "pozitivni",
      ime: "Pozitivni brez kvalifikacije",
      opis: "So rekli da konkretnemu koraku?",
      prazno: "Ni pozitivnih odzivov, ki čakajo.",
      vrstice: vFazi("pozitiven").map((o) => vrstica(o, `${dni(o) ?? "?"} dni v fazi. ${korak(o)}`)),
    },
    {
      kljuc: "kvalificirani",
      ime: "Sestanki za dogovor",
      opis: "Kvalificiran lead, sestanka še ni.",
      prazno: "Noben lead ne čaka na sestanek.",
      vrstice: vFazi("kvalificiran").map((o) => vrstica(o, korak(o))),
    },
    {
      kljuc: "ponudbe",
      ime: "Ponudbe brez odgovora",
      opis: "Ponudba poslana, odgovora še ni.",
      prazno: "Nobena ponudba ne čaka.",
      vrstice: vFazi("ponudba").map((o) => vrstica(o, `Poslana pred ${dni(o) ?? "?"} dnevi. ${korak(o)}`)),
    },
    {
      kljuc: "pogajanja",
      ime: "Pogajanja",
      opis: "Odprta pogajanja.",
      prazno: "Pogajanj ni.",
      vrstice: vFazi("pogajanja").map((o) => vrstica(o, korak(o))),
    },
    {
      kljuc: "zastale",
      ime: `Zastale (${ZASTALA_DNI} dni)`,
      opis: `Odprta priložnost brez aktivnosti ${ZASTALA_DNI} dni ali več.`,
      prazno: "Nobena priložnost ne stoji.",
      vrstice: zastale.map(({ o, z }) => vrstica(o, `Zadnja aktivnost ${lepDatum(z as string)} (${dniMed(z as string, danes)} dni). ${korak(o)}`)),
    },
  ];
}

export type UgotovitevProdaje = { kljuc: string; ton: "pozor" | "info"; besedilo: string; cilj?: string };

function seznamImen(imena: string[]): string {
  return imena.length > 1 ? `${imena.slice(0, -1).join(", ")} in ${imena.at(-1)}` : (imena[0] ?? "");
}

/** Dodatne ugotovitve v4: razvrstitev, kampanje, kanal odziva, zastale priložnosti in cilji meseca (samo iz števil). */
export function ugotovitveProdaje(k: {
  veriga: Veriga;
  kampanje: VrsticaKampanje[];
  dogodki: Dogodek[];
  akcije: AkcijaProdaje[];
  cilji: ReturnType<typeof dosezenoCiljev>;
  brez: boolean;
}): UgotovitevProdaje[] {
  if (k.brez) return [];
  const out: UgotovitevProdaje[] = [];
  const raz = k.akcije.find((a) => a.kljuc === "razvrstitev")!.vrstice.length;
  if (raz) {
    out.push({
      kljuc: "razvrstitev",
      ton: "pozor",
      besedilo: `${raz} ${oblika(raz, ["odziv čaka", "odziva čakata", "odzivi čakajo", "odzivov čaka"])} na tvojo razvrstitev (pozitiven, nevtralen ali negativen).`,
      cilj: "akcija-razvrstitev",
    });
  }
  const zast = k.akcije.find((a) => a.kljuc === "zastale")!.vrstice.length;
  if (zast) {
    out.push({
      kljuc: "zastale",
      ton: "pozor",
      besedilo: `${zast} ${oblika(zast, ["priložnost stoji", "priložnosti stojita", "priložnosti stojijo", "priložnosti stoji"])} ${ZASTALA_DNI} dni ali več.`,
      cilj: "akcija-zastale",
    });
  }
  const primerljive = k.kampanje.filter((x) => !x.premalo && x.kampanja !== NI_ZAPISANO);
  if (primerljive.length >= 2) {
    const naj = [...primerljive].sort((a, b) => b.odzivi / b.kontaktirana - a.odzivi / a.kontaktirana)[0];
    const brezOdziva = primerljive.filter((x) => x.odzivi === 0).map((x) => x.ime);
    if (naj.odzivi) {
      out.push({
        kljuc: "kampanja",
        ton: "info",
        besedilo: `Največ odzivov ima različica ${naj.ime}: ${naj.odzivi} od ${naj.kontaktirana} (${odstotek(naj.odzivi, naj.kontaktirana)}).${brezOdziva.length ? ` ${seznamImen(brezOdziva)} ${brezOdziva.length === 1 ? "je še brez odziva" : "so še brez odziva"}.` : ""}`,
      });
    }
  }
  const odz = k.dogodki.filter((e) => e.korak === "odgovor");
  const klic = odz.filter((e) => e.nacin === "klic").length;
  if (odz.length >= NAJMANJ_ZA_OCENO && klic) {
    out.push({
      kljuc: "kanal",
      ton: "info",
      besedilo: `${klic} od ${odz.length} ${oblika(odz.length, ["odziva", "odzivov", "odzivov", "odzivov"])} je prišlo na klic, ${odz.length - klic} po mailu.`,
    });
  }
  const mesec = k.cilji.obdobja[0];
  const zCiljem = k.cilji.mere.map((m) => ({ m, o: m.obdobja[0] })).filter(({ o }) => o.cilj !== null);
  if (zCiljem.length) {
    const deli = zCiljem.slice(0, 3).map(({ m, o }) => `${m.ime.toLowerCase().split(" (")[0]} ${m.denar ? eur(o.dosezeno ?? 0) : o.dosezeno} od ${m.denar ? eur(o.cilj as number) : o.cilj} (${Math.round(o.delez ?? 0)} %)`);
    out.push({ kljuc: "cilji", ton: "info", besedilo: `Cilji za ${mesec.ime}: ${deli.join(", ")}.` });
  }
  return out;
}

// ——— predal verige in realizirano v razponu (cilji) ———

/** Vrstice predala za člen verige: ena na podjetje, dogodek tega koraka (ali najbližji). */
export function vrsticeVerige(kljuc: Exclude<KorakVerige, "prihodki">, domene: string[], dogodki: Dogodek[], prl: PriloznostPregled[], danes: string): Dogodek[] {
  const korak: Record<Exclude<KorakVerige, "prihodki">, string[]> = {
    kontaktirana: ["prvi", "follow_up", "klic", "video", "zadnji"],
    odzivi: ["odgovor"],
    pozitivni: ["odgovor"],
    leadi: ["lead"],
    sestanki: ["sestanek", "lead"],
    ponudbe: ["posel"],
    posli: ["posel"],
  };
  return domene.map((d) => {
    const o = prl.filter((x) => x.domena === d).sort((a, b) => najdlje(b) - najdlje(a))[0];
    if ((kljuc === "ponudbe" || kljuc === "pozitivni") && o) return priloznostiZaPredal([o], danes)[0];
    const ev = dogodki
      .filter((e) => e.domena === d && korak[kljuc].includes(e.korak))
      .sort((a, b) => (a.cas ?? "9999").localeCompare(b.cas ?? "9999"));
    const e = ev[0] ?? dogodki.filter((x) => x.domena === d).sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""))[0];
    return e ?? { cas: null, korak: "lead", domena: d, produkt: "panik" };
  });
}

/** Realizirani prihodki v razponu celih mesecev: aplikacija (z znano ceno) + posli iz lijaka; brez aplikacije null. */
export function realiziranoVRazponu(posli: PoselVrednost[], nalogi: NalogAplikacije[] | null, od: string, d: string): number | null {
  if (!nalogi) return null;
  let v = nalogi.filter((n) => n.datum >= od && n.datum <= d && n.znesek !== null).reduce((a, n) => a + (n.znesek as number), 0);
  for (let m = od.slice(0, 7); m <= d.slice(0, 7); m = plusMesec(m, 1)) v += posli.reduce((a, p) => a + prihodekPoslaVMesecu(p, m), 0);
  return v;
}
