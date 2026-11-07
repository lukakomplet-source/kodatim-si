/**
 * Pregled v3 (Luka 6. 11. 2026, »Management overview« + »Final functionality & data audit«): rezultat na vrhu,
 * lijak rezultatov, akcijski center, ugotovitve »Kaj se dogaja?« in mere brez dvojnega štetja.
 *
 * Vse je zgrajeno na funkcijah iz pregled-racun.ts (te ostanejo nespremenjene, preverja jih parity). Nič ni
 * izmišljeno: kar se ne beleži, je N/A ali pa se ne pokaže; ugotovitve so samo iz števil, ki so na strani.
 */

import {
  AKTIVNOSTI,
  NI_ZAPISOV,
  REZULTATI,
  enaNaPodjetje,
  karticePregleda,
  kontaktirana,
  lepDatum,
  nedostavljeni,
  odstotek,
  predPrvimZapisom,
  premakniDan,
  samoSKlicem,
  seznamLijakaVeriga,
  seznamZa,
  sprememba,
  tedniPonNed,
  trendPoTednih,
  vRazponu,
  verigaLijaka,
  type Dogodek,
  type KarticaPregleda,
  type Korak,
  type PregledPodatki,
  type Razpon,
} from "./pregled-racun";

// ——— slovenske oblike ———

/** Oblika za 1, 2, 3–4 in 0/5+ (»1 odziv, 2 odziva, 3 odzivi, 5 odzivov«). */
export function oblika(n: number, o: readonly [string, string, string, string]): string {
  const r = Math.abs(n) % 100;
  return r === 1 ? o[0] : r === 2 ? o[1] : r === 3 || r === 4 ? o[2] : o[3];
}
export const PODJETJE = ["podjetje", "podjetji", "podjetja", "podjetij"] as const;
const KONTAKTIRANO = ["kontaktirano podjetje", "kontaktirani podjetji", "kontaktirana podjetja", "kontaktiranih podjetij"] as const;
const ODZIV = ["odziv", "odziva", "odzivi", "odzivov"] as const;
const LEAD = ["lead", "leada", "leadi", "leadov"] as const;
const SESTANEK = ["sestanek", "sestanka", "sestanki", "sestankov"] as const;
const POSEL = ["posel", "posla", "posli", "poslov"] as const;
const KORAK = ["korak", "koraka", "koraki", "korakov"] as const;
const MAIL = ["mail", "maila", "maili", "mailov"] as const;
const DAN = ["dan", "dneva", "dni", "dni"] as const;

function st(n: number, o: readonly [string, string, string, string]): string {
  return `${n} ${oblika(n, o)}`;
}

/** »1 mail se ni dostavil, 2 maila se nista dostavila, 3 maili se niso dostavili, 5 mailov se ni dostavilo«. */
export function nedostavljenoBesedilo(n: number): string {
  return `${st(n, MAIL)} ${oblika(n, ["se ni dostavil", "se nista dostavila", "se niso dostavili", "se ni dostavilo"])}`;
}

// ——— A. rezultat ———

/** Imena v razdelku Rezultat (Lukova vprašanja: kontaktirali, odgovorili, leadi, sestanki, posli). */
const IME_REZULTATA: Record<string, string> = {
  kontaktirana: "Kontaktirana podjetja",
  odgovor: "Odzivi",
  lead: "Kvalificirani leadi",
  sestanek: "Sestanki",
  posel: "Zaključeni posli",
};

/**
 * Kartice razdelka Rezultat: kontaktirana podjetja (kot osnova lijaka: prvi mail ali klic v obdobju) in štirje
 * rezultati (podjetja s prvim tovrstnim dogodkom v obdobju), vse s spremembo in trendom kot doslej.
 */
export function karticeRezultata(
  dogodki: Dogodek[],
  podjetja: PregledPodatki["podjetja"],
  zdaj: Razpon,
  prej: Razpon,
  brezVidea: boolean,
  konec: string,
  prvi: string | null,
): KarticaPregleda[] {
  const brez = predPrvimZapisom(zdaj, prvi);
  const n = kontaktirana(dogodki, zdaj).size;
  const nPrej = prej !== null ? kontaktirana(dogodki, prej).size : null;
  const nedost = nedostavljeni(dogodki, podjetja, zdaj);
  const samoKlic = samoSKlicem(dogodki, zdaj);
  const deli = [nedost ? nedostavljenoBesedilo(nedost) : "", samoKlic ? `${samoKlic} samo s klicem` : ""].filter(Boolean);
  const kont: KarticaPregleda = {
    kljuc: "kontaktirana",
    ime: IME_REZULTATA.kontaktirana,
    skupina: "aktivnost",
    stevilo: n,
    prej: brez ? null : nPrej,
    enota: "podjetij",
    na: brez ? NI_ZAPISOV : undefined,
    dodatno: !brez && deli.length ? deli.join(" · ") : undefined,
    sprememba: brez ? sprememba(0, null) : sprememba(n, nPrej),
    trend: brez ? tedniPonNed(konec).map((v) => ({ ...v, stevilo: null })) : trendPoTednih(dogodki, "kontaktirana", konec, prvi),
  };
  const rezultati = karticePregleda(dogodki, podjetja, zdaj, prej, brezVidea, konec, prvi)
    .filter((k) => REZULTATI.includes(k.kljuc as Korak))
    .map((k) => ({ ...k, ime: IME_REZULTATA[k.kljuc] ?? k.ime }));
  return [kont, ...rezultati];
}

export type StopnjaOdziva = {
  /** Podjetja z odzivom v obdobju. */
  stevec: number;
  /** Podjetja, kontaktirana v obdobju. */
  imenovalec: number;
  /** »8,1 %«; »–« brez imenovalca. */
  besedilo: string;
  /** Prejšnje obdobje (»6 %«); null brez primerjave. */
  prej: string | null;
  /** Razlika v odstotnih točkah (2,1 = +2,1 o. t.); null brez primerjave ali imenovalca. */
  razlikaTock: number | null;
  na?: string;
};

/** Stopnja odziva = odzivi v obdobju / kontaktirana v obdobju (isti števili kot kartici ob njej). */
export function stopnjaOdziva(dogodki: Dogodek[], zdaj: Razpon, prej: Razpon, brez: boolean): StopnjaOdziva {
  const stevec = enaNaPodjetje(dogodki, "odgovor", zdaj).size;
  const imenovalec = kontaktirana(dogodki, zdaj).size;
  if (brez) return { stevec, imenovalec, besedilo: "–", prej: null, razlikaTock: null, na: NI_ZAPISOV };
  let p: string | null = null;
  let razlika: number | null = null;
  if (prej !== null) {
    const ps = enaNaPodjetje(dogodki, "odgovor", prej).size;
    const pi = kontaktirana(dogodki, prej).size;
    p = odstotek(ps, pi);
    if (pi && imenovalec) razlika = (stevec / imenovalec - ps / pi) * 100;
  }
  return { stevec, imenovalec, besedilo: odstotek(stevec, imenovalec), prej: p, razlikaTock: razlika };
}

/**
 * En stavek, ki pove stanje v treh sekundah: »99 kontaktiranih podjetij in 8 odzivov (8,1 %). Leadov, sestankov in
 * poslov še ni.« Samo samostalniki s števili (brez glagolov), da je slovnica pravilna pri vsakem številu.
 */
export function stavekStanja(k: {
  kontaktirana: number;
  odzivi: number;
  leadi: number;
  sestanki: number;
  posli: number;
  stopnja: string;
  brez: boolean;
  prvi: string | null;
}): string {
  if (k.brez) return k.prvi ? `Pred ${lepDatum(k.prvi)} ni zapisov.` : "Zapisov še ni.";
  if (!k.kontaktirana && !k.odzivi && !k.leadi && !k.sestanki && !k.posli) return "V tem obdobju ni bilo prodajnih aktivnosti.";
  const deli = [
    `${k.kontaktirana} ${oblika(k.kontaktirana, KONTAKTIRANO)}`,
    k.odzivi || k.kontaktirana ? `${st(k.odzivi, ODZIV)}${k.kontaktirana ? ` (${k.stopnja})` : ""}` : "",
    k.leadi ? st(k.leadi, LEAD) : "",
    k.sestanki ? st(k.sestanki, SESTANEK) : "",
    k.posli ? st(k.posli, POSEL) : "",
  ].filter(Boolean);
  const ni = [!k.leadi ? "leadov" : "", !k.sestanki ? "sestankov" : "", !k.posli ? "poslov" : ""].filter(Boolean);
  const prvi = deli.length > 1 ? `${deli.slice(0, -1).join(", ")} in ${deli.at(-1)}` : deli[0];
  const drugi = ni.length ? ` ${veliko(ni.length > 1 ? `${ni.slice(0, -1).join(", ")} in ${ni.at(-1)}` : ni[0])} še ni.` : "";
  return `${veliko(prvi)}.${drugi}`;
}

function veliko(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ——— B. lijak rezultatov ———

export type FazaKljuc = "kontaktirana" | Korak;

export type FazaLijaka = {
  kljuc: FazaKljuc;
  ime: string;
  /** Podjetja iz kohorte (prvič kontaktirana v obdobju), ki so do danes prišla do te faze. */
  stevilo: number;
  /** Od vseh kontaktiranih (»8,1 %«). */
  odZacetka: string;
  /** Od prejšnje faze (»0 %«); null pri prvi fazi. */
  pretvorba: string | null;
  /** Širina proge v odstotkih (od kontaktiranih). */
  delez: number;
};

/** Najmanj podjetij v prejšnji fazi, da prehod šteje za oceno »največja izguba« (manj je naključje). */
export const NAJMANJ_ZA_OCENO = 5;

const IME_FAZE: Record<FazaKljuc, string> = {
  kontaktirana: "Kontaktirana",
  prvi: "",
  follow_up: "",
  klic: "",
  video: "",
  zadnji: "",
  odgovor: "Odzivi",
  lead: "Kvalificirani leadi",
  sestanek: "Sestanki",
  posel: "Zaključeni posli",
};

/**
 * Lijak samo rezultatov: kontaktirana → odzivi → leadi → sestanki → posli. Kohorta in veriga sta isti kot doslej
 * (verigaLijaka: vsaka faza je podmnožica prejšnje, zato je pretvorba največ 100 %). »najsibkejsa« je indeks faze,
 * pri kateri je pretvorba iz prejšnje najnižja, med prehodi, kjer je bilo v prejšnji fazi vsaj NAJMANJ_ZA_OCENO
 * podjetij; null, ko takega prehoda ni. »zunajVerige«: podjetja, ki so do faze prišla mimo prejšnje (na karticah so).
 */
export function lijakRezultatov(
  dogodki: Dogodek[],
  r: Razpon,
): { faze: FazaLijaka[]; najsibkejsa: number | null; zunajVerige: { ime: string; stevilo: number }[] } {
  const kohorta = kontaktirana(dogodki, r);
  const veriga = verigaLijaka(dogodki, r);
  const n0 = kohorta.size;
  const faze: FazaLijaka[] = [{ kljuc: "kontaktirana", ime: IME_FAZE.kontaktirana, stevilo: n0, odZacetka: n0 ? "100 %" : "–", pretvorba: null, delez: n0 ? 100 : 0 }];
  const zunajVerige: { ime: string; stevilo: number }[] = [];
  let prej = n0;
  for (const k of REZULTATI) {
    const n = veriga.get(k)!.size;
    const vsi = new Set(dogodki.filter((e) => e.korak === k && kohorta.has(e.domena)).map((e) => e.domena)).size;
    if (vsi > n) zunajVerige.push({ ime: IME_FAZE[k], stevilo: vsi - n });
    faze.push({ kljuc: k, ime: IME_FAZE[k], stevilo: n, odZacetka: odstotek(n, n0), pretvorba: odstotek(n, prej), delez: n0 ? (n / n0) * 100 : 0 });
    prej = n;
  }
  let najsibkejsa: number | null = null;
  let najnizja = Infinity;
  for (let i = 1; i < faze.length; i++) {
    const p = faze[i - 1].stevilo;
    if (p < NAJMANJ_ZA_OCENO) continue;
    const q = faze[i].stevilo / p;
    if (q < najnizja) {
      najnizja = q;
      najsibkejsa = i;
    }
  }
  return { faze, najsibkejsa, zunajVerige };
}

/** Seznam za fazo lijaka: toliko vrstic, kot je število v fazi. */
export function seznamFaze(dogodki: Dogodek[], kljuc: FazaKljuc, r: Razpon): Dogodek[] {
  if (kljuc === "kontaktirana") return seznamZa(dogodki, "kontaktirana", r);
  return seznamLijakaVeriga(dogodki, kljuc, r);
}

// ——— C. akcijski center ———

export type AkcijaKljuc = "danes" | "zamujeno" | "caka" | "leadi" | "sestanki" | "pozornost";

export type Akcija = {
  kljuc: AkcijaKljuc;
  ime: string;
  /** Ena vrstica pod številom (pravilo). */
  opis: string;
  /** Besedilo v praznem predalu. */
  prazno: string;
  /** Ena vrstica na podjetje: zadnji dogodek podjetja z razlogom (za predal). */
  vrstice: Dogodek[];
};

/** Stanja, pri katerih se s podjetjem ne dela več (ali še ni mogoče). */
const KONEC = new Set(["ne_zanima", "nedostavljeno", "kupil", "zakljucen"]);

/** Dni od a do b (YYYY-MM-DD), b ≥ a → pozitivno. */
export function dniMed(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Zadnji dogodek podjetja z znanim časom (sicer katerikoli), za vrstico v predalu. */
function zadnjiDogodki(dogodki: Dogodek[]): Map<string, Dogodek> {
  const m = new Map<string, Dogodek>();
  for (const e of dogodki) {
    if (e.korak === "lead") continue; // lead je izpeljan, vrstica naj pokaže, kaj se je zgodilo
    const star = m.get(e.domena);
    if (!star || (e.cas !== null && (star.cas === null || e.cas >= star.cas))) m.set(e.domena, e);
  }
  return m;
}

/**
 * Akcijski center: kaj je treba narediti zdaj. Ne glede na obdobje (stanje danes), upošteva pa produkt (in druge
 * filtre), ker dobi že izbrane dogodke. Iz naslednjega koraka in roka, ki ju izračuna Harvey (posiljanja.py
 * naslednji_korak), in iz dogodkov. Izključena so podjetja, ki so rekla ne, z vrnjenim mailom, kupila ali zaključena.
 *
 * - danes / zamujeno / čakamo: rok naslednjega koraka je danes / pred danes / po danes (slednje samo brez odziva).
 *   Med seboj se ne prekrivajo.
 * - leadi brez naslednjega koraka: lead brez naslednjega koraka in brez prihodnjega sestanka.
 * - sestanki: dogovorjen sestanek od danes do 7 dni naprej.
 * - rabi pozornost: odziv brez »ne«, pri katerem naslednjega koraka ni ali je zamujen, ter sestanek, ki je mimo,
 *   izid (posel ali ne) pa ni vpisan. Se lahko prekriva z »zamujeno« (drug pogled: podjetja, ki so že odgovorila).
 */
export function akcijskiCenter(dogodki: Dogodek[], podjetja: PregledPodatki["podjetja"], danes: string): Akcija[] {
  const domene = new Set(dogodki.map((e) => e.domena));
  const rekliNe = new Set(
    dogodki.filter((e) => (e.korak === "odgovor" && e.negativen) || (e.korak === "klic" && e.izid === "ne_zanima")).map((e) => e.domena),
  );
  const posli = new Set(dogodki.filter((e) => e.korak === "posel").map((e) => e.domena));
  const odzvani = new Set(dogodki.filter((e) => e.korak === "odgovor").map((e) => e.domena));
  const leadi = new Set(dogodki.filter((e) => e.korak === "lead").map((e) => e.domena));
  const zadnji = zadnjiDogodki(dogodki);
  const cez7 = premakniDan(danes, 7);

  const v: Record<AkcijaKljuc, Dogodek[]> = { danes: [], zamujeno: [], caka: [], leadi: [], sestanki: [], pozornost: [] };
  // Isto podjetje je v eni kategoriji samo enkrat; drugi razlog se doda k prvemu.
  const dodaj = (k: AkcijaKljuc, dom: string, razlog: string) => {
    const e = zadnji.get(dom);
    if (!e) return;
    const obstojec = v[k].find((x) => x.domena === dom);
    if (obstojec) obstojec.razlog = `${obstojec.razlog}. ${razlog}`;
    else v[k].push({ ...e, razlog });
  };

  for (const dom of [...domene].sort()) {
    const p = podjetja[dom];
    if (!p || KONEC.has(p.stanje) || rekliNe.has(dom) || posli.has(dom)) continue;
    const kdaj = p.naslednji && p.naslednjiKdaj ? p.naslednjiKdaj : "";
    const sestanek = (p.sestanekKdaj ?? "").slice(0, 10);

    if (kdaj && kdaj === danes) dodaj("danes", dom, `${p.naslednji}, danes`);
    else if (kdaj && kdaj < danes) {
      const n = dniMed(kdaj, danes);
      dodaj("zamujeno", dom, `${p.naslednji}, rok ${lepDatum(kdaj)} (${st(n, DAN)} zamude)`);
    } else if (kdaj && !odzvani.has(dom)) dodaj("caka", dom, `Še brez odziva. Naslednje: ${p.naslednji}, ${lepDatum(kdaj)}`);

    if (leadi.has(dom) && !p.naslednji && !(sestanek && sestanek >= danes)) dodaj("leadi", dom, "Lead brez naslednjega koraka");

    if (sestanek && sestanek >= danes && sestanek <= cez7) {
      const ura = (p.sestanekKdaj ?? "").slice(11, 16);
      dodaj("sestanki", dom, `Sestanek ${lepDatum(sestanek)}${ura ? ` ob ${ura}` : ""}`);
    }

    if (odzvani.has(dom)) {
      if (!p.naslednji) dodaj("pozornost", dom, "Odzvali so se, naslednjega koraka ni");
      else if (kdaj && kdaj < danes) dodaj("pozornost", dom, `Odzvali so se. ${p.naslednji} zamuja ${st(dniMed(kdaj, danes), DAN)}`);
    }
    if (sestanek && sestanek < danes) dodaj("pozornost", dom, `Sestanek ${lepDatum(sestanek)} je mimo, izid ni vpisan`);
  }

  // Najbolj zamujeno in najbližje najprej; drugje po imenu (vrstni red domen).
  const rok = (e: Dogodek) => podjetja[e.domena]?.naslednjiKdaj ?? "";
  v.zamujeno.sort((a, b) => rok(a).localeCompare(rok(b)));
  v.caka.sort((a, b) => rok(a).localeCompare(rok(b)));
  v.sestanki.sort((a, b) => (podjetja[a.domena]?.sestanekKdaj ?? "").localeCompare(podjetja[b.domena]?.sestanekKdaj ?? ""));

  return [
    { kljuc: "danes", ime: "Na vrsti danes", opis: "Rok naslednjega koraka je danes.", prazno: "Danes ni nobenega koraka na vrsti.", vrstice: v.danes },
    { kljuc: "zamujeno", ime: "Zamujeno", opis: "Rok naslednjega koraka je že mimo.", prazno: "Nič ni zamujeno.", vrstice: v.zamujeno },
    { kljuc: "caka", ime: "Čakamo na odgovor", opis: "Še brez odziva, naslednji korak je kasneje.", prazno: "Nobeno podjetje ne čaka.", vrstice: v.caka },
    {
      kljuc: "leadi",
      ime: "Leadi brez naslednjega koraka",
      opis: "Lead, ki nima ne koraka ne sestanka.",
      prazno: "Vsi leadi imajo naslednji korak (ali leadov še ni).",
      vrstice: v.leadi,
    },
    { kljuc: "sestanki", ime: "Sestanki v 7 dneh", opis: "Dogovorjeni sestanki od danes naprej.", prazno: "V naslednjih 7 dneh ni sestankov.", vrstice: v.sestanki },
    {
      kljuc: "pozornost",
      ime: "Rabi pozornost",
      opis: "Odzvali so se, korak manjka ali zamuja; sestanek brez izida.",
      prazno: "Nobeno podjetje z odzivom ne čaka na nas.",
      vrstice: v.pozornost,
    },
  ];
}

// ——— ugotovitve »Kaj se dogaja?« ———

export type Ugotovitev = {
  kljuc: string;
  /** pozor = nekaj čaka na nas; info = dejstvo. */
  ton: "pozor" | "info";
  besedilo: string;
  /** Kaj odpre klik: »akcija-<kljuc>«, »lijak-<faza>« ali »nedostavljeni«; brez = ni seznama. */
  cilj?: string;
};

/**
 * Kratko ime iz registrskega: do prve vejice in do prve besede z malo začetnico, VELIKE ČRKE v obliko »Binal
 * Transport« (»BINAL TRANSPORT storitve transporta …, d.o.o.« → »Binal Transport«). Brez imena domena.
 */
export function kratkoIme(polno: string | undefined, domena: string): string {
  const pred = (polno || "").split(",")[0].replace(/\s+(d\.\s*o\.\s*o\.|s\.\s*p\.|d\.\s*d\.)\s*$/i, "").trim();
  if (!pred) return domena;
  const besede = pred.split(/\s+/);
  const i = besede.findIndex((b, j) => j > 0 && /^\p{Ll}/u.test(b));
  const izbor = (i > 0 ? besede.slice(0, i) : besede).slice(0, 4);
  return izbor.map((b) => (b.length > 1 && b === b.toUpperCase() && /\p{Lu}/u.test(b) ? b[0] + b.slice(1).toLowerCase() : b)).join(" ");
}

/** »Binal Transport, Logistika Ribič in še 2«. */
function imena(vrstice: Dogodek[], podjetja: PregledPodatki["podjetja"], n = 3): string {
  const vsa = vrstice.map((e) => kratkoIme(podjetja[e.domena]?.podjetje, e.domena));
  if (vsa.length <= n) return vsa.length > 1 ? `${vsa.slice(0, -1).join(", ")} in ${vsa.at(-1)}` : vsa[0];
  return `${vsa.slice(0, n).join(", ")} in še ${vsa.length - n}`;
}

/** Rodilnik za »od N …«: »od 1 podjetja«, »od 2, 5, 8 podjetij«. */
function rod(n: number, o: readonly [string, string]): string {
  return `${n} ${Math.abs(n) % 100 === 1 ? o[0] : o[1]}`;
}

/**
 * Besedilo za največjo izgubo med fazama i-1 in i (samo iz števil). Prvo število je vedno prejšnja faza, ker klik
 * odpre njen seznam (podjetja, s katerimi je treba delati naprej).
 */
function besediloIzgube(f: FazaLijaka[], i: number): string {
  const a = f[i - 1].stevilo;
  const b = f[i];
  if (b.kljuc === "odgovor")
    return `Največ izgubimo pri odzivu: od ${rod(a, ["kontaktiranega podjetja", "kontaktiranih podjetij"])} se ${b.stevilo ? `jih je odzvalo ${b.stevilo} (${b.pretvorba})` : "še nobeno ni odzvalo"}.`;
  if (b.kljuc === "lead")
    return `Največ izgubimo med odzivom in leadom: od ${rod(a, ["podjetja", "podjetij"])} z odzivom ${b.stevilo ? `je lead postalo ${b.stevilo} (${b.pretvorba})` : "še nobeno ni postalo lead"}.`;
  if (b.kljuc === "sestanek")
    return `Največ izgubimo med leadom in sestankom: od ${rod(a, ["leada", "leadov"])} ${b.stevilo ? `ima sestanek ${b.stevilo} (${b.pretvorba})` : "še noben nima sestanka"}.`;
  return `Največ izgubimo med sestankom in poslom: od ${rod(a, ["sestanka", "sestankov"])} ${b.stevilo ? `se je s poslom končalo ${b.stevilo} (${b.pretvorba})` : "se še noben ni končal s poslom"}.`;
}

/**
 * Kratke ugotovitve iz števil na strani, po pomembnosti: kar čaka na nas, nato največja izguba v lijaku, nato
 * dejstva. Brez priporočil, ki ne izhajajo iz podatkov.
 */
export function ugotovitve(k: {
  lijak: ReturnType<typeof lijakRezultatov>;
  akcije: Akcija[];
  nedostavljenih: number;
  podjetja: PregledPodatki["podjetja"];
  brez: boolean;
}): Ugotovitev[] {
  if (k.brez) return [];
  const a = Object.fromEntries(k.akcije.map((x) => [x.kljuc, x])) as Record<AkcijaKljuc, Akcija>;
  const out: Ugotovitev[] = [];

  const poz = a.pozornost.vrstice;
  if (poz.length) {
    const n = poz.length;
    out.push({
      kljuc: "pozornost",
      ton: "pozor",
      besedilo: `${veliko(st(n, PODJETJE))} z odzivom ${oblika(n, ["čaka", "čakata", "čakajo", "čaka"])} na nas: ${imena(poz, k.podjetja)}.`,
      cilj: "akcija-pozornost",
    });
  }
  const zam = a.zamujeno.vrstice.length;
  const dan = a.danes.vrstice.length;
  if (zam || dan) {
    const deli = [
      zam ? `${oblika(zam, ["zamujen je", "zamujena sta", "zamujeni so", "zamujenih je"])} ${st(zam, KORAK)}` : "",
      dan ? `danes ${oblika(dan, ["je", "sta", "so", "je"])} na vrsti ${st(dan, KORAK)}` : "",
    ].filter(Boolean);
    out.push({ kljuc: "koraki", ton: zam ? "pozor" : "info", besedilo: `${veliko(deli.join(", "))}.`, cilj: zam ? "akcija-zamujeno" : "akcija-danes" });
  }
  if (a.leadi.vrstice.length) {
    out.push({ kljuc: "leadi", ton: "pozor", besedilo: `${veliko(st(a.leadi.vrstice.length, LEAD))} brez naslednjega koraka.`, cilj: "akcija-leadi" });
  }
  if (a.sestanki.vrstice.length) {
    out.push({ kljuc: "sestanki", ton: "info", besedilo: `V naslednjih 7 dneh: ${st(a.sestanki.vrstice.length, SESTANEK)}.`, cilj: "akcija-sestanki" });
  }

  const f = k.lijak.faze;
  if (k.lijak.najsibkejsa !== null) {
    const i = k.lijak.najsibkejsa;
    out.push({ kljuc: "izguba", ton: "info", besedilo: besediloIzgube(f, i), cilj: `lijak-${f[i - 1].kljuc}` });
  } else if (f[0].stevilo) {
    out.push({
      kljuc: "izguba",
      ton: "info",
      besedilo: `Za oceno, kje izgubljamo, je še premalo podatkov (pri vsaki fazi manj kot ${NAJMANJ_ZA_OCENO} podjetij).`,
    });
  }
  if (k.nedostavljenih) {
    out.push({
      kljuc: "nedostavljeni",
      ton: "info",
      besedilo: `${nedostavljenoBesedilo(k.nedostavljenih)}, ${k.nedostavljenih === 1 ? "to podjetje za nas še ni slišalo" : "ta podjetja za nas še niso slišala"}.`,
      cilj: "nedostavljeni",
    });
  }
  return out;
}

/** Predstavitveni maili podjetij z vrnjenim mailom (stanje »nedostavljeno«), ena vrstica na podjetje. */
export function seznamNedostavljenih(dogodki: Dogodek[], podjetja: PregledPodatki["podjetja"], r: Razpon): Dogodek[] {
  const videno = new Set<string>();
  return seznamZa(dogodki, "prvi", r).filter(
    (e) => podjetja[e.domena]?.stanje === "nedostavljeno" && (videno.has(e.domena) ? false : (videno.add(e.domena), true)),
  );
}

// ——— filtra kampanja in oseba (audit 6. 11.) ———

/** Vrednost filtra za »ni zapisano« (prazna kampanja ali oseba). */
export const NI_ZAPISANO = "ni-zapisano";

/** Kdo je naredil aktivnost: »luka (5. 11.: …), izvedel Claude«, »luka@kompletko.com« → »Luka«; prazno = ni zapisano. */
export function osebaIz(kdo: string | undefined): string {
  // samo prva beseda: »Luka 4. 11. (»…«)« je tudi Luka
  const s = (kdo ?? "").trim().split(/[\s(,@.]/)[0];
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : "";
}

export type Moznost = { kljuc: string; ime: string; stevilo: number };

/**
 * Filtra, ki veljata za vse dele strani (produkt je že uporabljen v dogodkih):
 * - kampanja = različica prvega maila podjetja (Harvey posiljanja.varianta); velja za podjetje, zato vse njegove
 *   aktivnosti in rezultati spadajo vanjo;
 * - oseba = kdo je aktivnost naredil; aktivnosti samo te osebe, rezultati podjetij, s katerimi je ta oseba delala.
 */
export function zaFiltre(
  dogodki: Dogodek[],
  podjetja: PregledPodatki["podjetja"],
  kampanja: string | null,
  oseba: string | null,
): Dogodek[] {
  let out = dogodki;
  if (kampanja) {
    const iskana = kampanja === NI_ZAPISANO ? "" : kampanja;
    out = out.filter((e) => (podjetja[e.domena]?.kampanja ?? "") === iskana);
  }
  if (oseba) {
    const iskana = oseba === NI_ZAPISANO ? "" : oseba;
    const moja = (e: Dogodek) => AKTIVNOSTI.includes(e.korak) && osebaIz(e.kdo) === iskana;
    const podj = new Set(out.filter(moja).map((e) => e.domena));
    out = out.filter((e) => (AKTIVNOSTI.includes(e.korak) ? moja(e) : podj.has(e.domena)));
  }
  return out;
}

/**
 * Možnosti filtrov s številom: kampanje (podjetij) iz dogodkov, ki so že filtrirani po produktu in osebi; osebe
 * (aktivnosti) iz dogodkov, filtriranih po produktu in kampanji. Tako se filtri med seboj upoštevajo.
 */
export function moznostiFiltrov(
  dogodki: Dogodek[],
  podjetja: PregledPodatki["podjetja"],
  kampanja: string | null,
  oseba: string | null,
): { kampanje: Moznost[]; osebe: Moznost[] } {
  const zaKampanje = zaFiltre(dogodki, podjetja, null, oseba);
  const k = new Map<string, Set<string>>();
  for (const e of zaKampanje) {
    const v = podjetja[e.domena]?.kampanja ?? "";
    if (!k.has(v)) k.set(v, new Set());
    k.get(v)!.add(e.domena);
  }
  const zaOsebe = zaFiltre(dogodki, podjetja, kampanja, null).filter((e) => AKTIVNOSTI.includes(e.korak));
  const o = new Map<string, number>();
  for (const e of zaOsebe) o.set(osebaIz(e.kdo), (o.get(osebaIz(e.kdo)) ?? 0) + 1);
  const urejeno = <T,>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "sl", { numeric: true })));
  return {
    kampanje: urejeno(k).map(([v, s]) => ({ kljuc: v || NI_ZAPISANO, ime: v ? `Prvi mail ${v}` : "Brez zapisane kampanje", stevilo: s.size })),
    osebe: urejeno(o).map(([v, n]) => ({ kljuc: v || NI_ZAPISANO, ime: v || "Ni zapisano", stevilo: n })),
  };
}

// ——— seznami za celice tabele aktivnosti (audit 6. 11.: vsaka številka odpre seznam) ———

export type StolpecTabele = "podjetja" | "odziv" | "lead" | "sestanek" | "posel";

/**
 * Za vsako podjetje z rezultatom aktivnost, ki ji je rezultat pripisan: zadnja aktivnost pred prvim rezultatom (ali
 * ob njem), samo če je v obdobju. Isto pravilo kot poAktivnostih() (pregled-racun.ts), zato so seznami enako dolgi
 * kot števila v tabeli (preverja .ogled-tmp/celice.ts).
 */
export function pripisi(dogodki: Dogodek[], r: Razpon): Map<string, Korak> {
  const po = new Map<string, Dogodek[]>();
  for (const e of dogodki) {
    if (!po.has(e.domena)) po.set(e.domena, []);
    po.get(e.domena)!.push(e);
  }
  const out = new Map<string, Korak>();
  for (const [dom, ev] of po) {
    const rezultat = ev.filter((e) => REZULTATI.includes(e.korak));
    if (!rezultat.length) continue;
    const prvi = rezultat.reduce((a, b) => ((b.cas ?? "9999") < (a.cas ?? "9999") ? b : a));
    const meja = prvi.cas ?? "9999";
    const pred = ev.filter((e) => AKTIVNOSTI.includes(e.korak) && (e.cas ?? "") <= meja).sort((a, b) => (a.cas ?? "").localeCompare(b.cas ?? ""));
    const akt = pred.at(-1);
    if (akt && vRazponu(akt.cas, r)) out.set(dom, akt.korak);
  }
  return out;
}

/**
 * Seznam za celico tabele: »podjetja« = podjetja, ki so aktivnost dobila v obdobju pred prvim rezultatom (zadnja
 * taka aktivnost na podjetje); rezultat = podjetja, katerih rezultat je pripisan tej aktivnosti (prvi tak dogodek).
 */
export function seznamCelice(dogodki: Dogodek[], r: Razpon, aktivnost: Korak, stolpec: StolpecTabele): Dogodek[] {
  if (stolpec === "podjetja") {
    const meja = new Map<string, string>();
    for (const e of dogodki) {
      if (!REZULTATI.includes(e.korak)) continue;
      const c = e.cas ?? "9999";
      const s = meja.get(e.domena);
      if (s === undefined || c < s) meja.set(e.domena, c);
    }
    const zadnja = new Map<string, Dogodek>();
    for (const e of dogodki) {
      if (e.korak !== aktivnost || !vRazponu(e.cas, r)) continue;
      const m = meja.get(e.domena);
      if (m !== undefined && (e.cas ?? "") > m) continue;
      const s = zadnja.get(e.domena);
      if (!s || (e.cas ?? "") >= (s.cas ?? "")) zadnja.set(e.domena, e);
    }
    return [...zadnja.values()].sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""));
  }
  const korak: Korak = stolpec === "odziv" ? "odgovor" : stolpec;
  const p = pripisi(dogodki, r);
  const prvi = new Map<string, Dogodek>();
  for (const e of dogodki) {
    if (e.korak !== korak || p.get(e.domena) !== aktivnost) continue;
    const s = prvi.get(e.domena);
    if (!s || (e.cas !== null && (s.cas === null || e.cas < s.cas))) prvi.set(e.domena, e);
  }
  return [...prvi.values()].sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""));
}

// ——— mere brez dvojnega štetja (audit 6. 11.) ———

/** Izidi klica, pri katerih je nekdo dvignil in se pogovoril (isto kot Harvey pregled.py POGOVOR). */
export const POGOVOR = ["sestanek", "poslji_mail", "ne_zanima", "poklici_kasneje"];

export type Mere = {
  /** Vsak mail in klic v obdobju. */
  aktivnosti: number;
  /** Različna podjetja z vsaj eno aktivnostjo v obdobju. */
  podjetja: number;
  /** Različni splošni naslovi teh podjetij (kamor smo pisali). */
  naslovi: number;
  /** Različne imenovane osebe pri teh podjetjih (s klicev). */
  osebe: number;
  /** Uspešni stiki (dogodki): pogovor na klicu ali pisni odgovor. Vrnjen mail in nedvignjen klic nista stik. */
  stiki: number;
  /** Podjetja z vsaj enim odzivom v obdobju. */
  odzivi: number;
  leadi: number;
  sestanki: number;
  posli: number;
};

/** »110 aktivnosti · 99 podjetij · 99 splošnih naslovov in 5 imenovanih oseb · 9 uspešnih stikov« */
export function opisMer(m: Mere): string {
  const kontakti = [m.naslovi ? st(m.naslovi, ["splošni naslov", "splošna naslova", "splošni naslovi", "splošnih naslovov"]) : "", m.osebe ? st(m.osebe, ["imenovana oseba", "imenovani osebi", "imenovane osebe", "imenovanih oseb"]) : ""]
    .filter(Boolean)
    .join(" in ");
  return [
    st(m.aktivnosti, ["aktivnost", "aktivnosti", "aktivnosti", "aktivnosti"]),
    st(m.podjetja, PODJETJE),
    kontakti,
    `${st(m.stiki, ["uspešen stik", "uspešna stika", "uspešni stiki", "uspešnih stikov"])} (pogovor ali pisni odgovor)`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function mere(dogodki: Dogodek[], podjetja: PregledPodatki["podjetja"], r: Razpon): Mere {
  const akt = dogodki.filter((e) => AKTIVNOSTI.includes(e.korak) && vRazponu(e.cas, r));
  const dom = new Set(akt.map((e) => e.domena));
  const naslovi = new Set([...dom].map((d) => (podjetja[d]?.email ?? "").trim().toLowerCase()).filter(Boolean));
  // Ista oseba pri dveh podjetjih sta dva kontakta (ime + podjetje).
  const osebe = new Set([...dom].filter((d) => (podjetja[d]?.oseba ?? "").trim()).map((d) => `${d}|${podjetja[d].oseba.trim().toLowerCase()}`));
  const stiki = dogodki.filter(
    (e) => vRazponu(e.cas, r) && ((e.korak === "klic" && POGOVOR.includes(e.izid ?? "")) || (e.korak === "odgovor" && e.nacin === "mail")),
  ).length;
  return {
    aktivnosti: akt.length,
    podjetja: dom.size,
    naslovi: naslovi.size,
    osebe: osebe.size,
    stiki,
    odzivi: enaNaPodjetje(dogodki, "odgovor", r).size,
    leadi: enaNaPodjetje(dogodki, "lead", r).size,
    sestanki: enaNaPodjetje(dogodki, "sestanek", r).size,
    posli: enaNaPodjetje(dogodki, "posel", r).size,
  };
}

// ——— E. prihodki iz vpisanih poslov (audit 6. 11.: one-time, MRR, ARR, pogodbena vrednost) ———

export type PoselVrednost = NonNullable<PregledPodatki["posli"]>[number];

/** Ime produkta za prihodke (ključi kot PRODUKTI). */
export const IME_PRODUKTA: Record<string, string> = {
  panik: "Panic button",
  monitoring: "Monitoring",
  spremstvo: "Escort",
  varovanje: "Fizično varovanje",
};

const VRSTA_PLACILA: Record<PoselVrednost["vrsta"], string> = { enkratno: "enkratno", mesecno: "mesečno", letno: "letno" };

/**
 * Pogodbena vrednost: enkratno = znesek; mesečno = znesek × trajanje; letno = znesek / 12 × trajanje. Brez trajanja
 * je pri ponavljajočem poslu neznana (null), nikoli ugibana.
 */
export function pogodbenaVrednost(p: PoselVrednost): number | null {
  if (p.vrsta === "enkratno") return p.znesek;
  if (!p.trajanje) return null;
  return p.vrsta === "mesecno" ? p.znesek * p.trajanje : (p.znesek / 12) * p.trajanje;
}

/** Mesečni prihodek posla na dan »dan«: samo ponavljajoč, začet in ne iztekel (začetek + trajanje mesecev). */
export function mrrPosla(p: PoselVrednost, dan: string): number {
  if (p.vrsta === "enkratno" || p.zacetek > dan) return 0;
  if (p.trajanje) {
    const [y, m, d] = p.zacetek.split("-").map(Number);
    const konec = new Date(Date.UTC(y, m - 1 + p.trajanje, d)).toISOString().slice(0, 10);
    if (dan >= konec) return 0;
  }
  return p.vrsta === "mesecno" ? p.znesek : p.znesek / 12;
}

export type PovzetekPoslov = {
  /** Razlog za N/A (poslov z vrednostjo še ni); null = so. */
  na: string | null;
  /** Novi posli v obdobju (datum sklenitve). */
  posli: number;
  /** Pogodbena vrednost novih poslov z znano vrednostjo; null, ko noben nov posel nima znane vrednosti. */
  pogodbena: number | null;
  brezPogodbene: number;
  /** Enkratni prihodki novih poslov. */
  enkratno: number;
  /** MRR na zadnji dan obdobja (vsi aktivni ponavljajoči posli), ARR = MRR × 12. */
  mrr: number;
  arr: number;
  /** Pogodbena vrednost / novi posli z znano vrednostjo. */
  povprecje: number | null;
  poProduktih: { produkt: string; ime: string; pogodbena: number | null; mrr: number }[];
  /** Pogodbena vrednost novih poslov po mesecih (zadnjih n do konca obdobja). */
  casovnica: { od: string; do: string; oznaka: string; znesek: number | null }[];
  /** Vrstice za predal: novi posli v obdobju in aktivni ponavljajoči (MRR). */
  novi: PoselVrednost[];
  ponavljajoci: PoselVrednost[];
};

export const POSLI_NA = "Zneskov poslov še ni. Ko posel sklenete, ga vpiši na kartici podjetja (Zapiši posel).";

const MES = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];

/**
 * Prihodki iz ročno vpisanih poslov za obdobje in filtre (produkt, kampanja, podjetja pri filtru osebe). Novi posli
 * so po datumu sklenitve v obdobju; MRR in ARR sta stanje na zadnji dan obdobja (pri »Vse« danes).
 */
export function povzetekPoslov(
  vsi: PoselVrednost[] | undefined,
  k: { produkt: string; kampanja: string | null; domene: Set<string> | null },
  r: Razpon,
  konec: string,
  n = 6,
): PovzetekPoslov {
  const [ky, km] = konec.split("-").map(Number);
  const casovnicaPrazna = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(ky, km - 1 - (n - 1 - i), 1));
    const od = d.toISOString().slice(0, 10);
    const zadnji = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return { od, do: zadnji, oznaka: `${MES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, znesek: null as number | null };
  });
  const produkti = Object.keys(IME_PRODUKTA).filter((p) => k.produkt === "vsi" || p === k.produkt);
  if (!vsi || !vsi.length) {
    return {
      na: POSLI_NA,
      posli: 0,
      pogodbena: null,
      brezPogodbene: 0,
      enkratno: 0,
      mrr: 0,
      arr: 0,
      povprecje: null,
      poProduktih: produkti.map((p) => ({ produkt: p, ime: IME_PRODUKTA[p], pogodbena: null, mrr: 0 })),
      casovnica: casovnicaPrazna,
      novi: [],
      ponavljajoci: [],
    };
  }
  const izbor = vsi.filter(
    (p) =>
      (k.produkt === "vsi" || p.produkt === k.produkt) &&
      (!k.kampanja || (p.kampanja || NI_ZAPISANO) === k.kampanja) &&
      (!k.domene || k.domene.has(p.domena)),
  );
  const vsota = (x: PoselVrednost[]): number | null => {
    const v = x.map(pogodbenaVrednost).filter((z): z is number => z !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : x.length ? null : 0;
  };
  const novi = izbor.filter((p) => vRazponu(p.datum, r)).sort((a, b) => b.datum.localeCompare(a.datum));
  const znanih = novi.filter((p) => pogodbenaVrednost(p) !== null).length;
  const pogodbena = vsota(novi);
  const ponavljajoci = izbor.filter((p) => mrrPosla(p, konec) > 0);
  const mrr = ponavljajoci.reduce((a, p) => a + mrrPosla(p, konec), 0);
  return {
    na: null,
    posli: novi.length,
    pogodbena,
    brezPogodbene: novi.length - znanih,
    enkratno: novi.filter((p) => p.vrsta === "enkratno").reduce((a, p) => a + p.znesek, 0),
    mrr,
    arr: mrr * 12,
    povprecje: znanih && pogodbena !== null ? pogodbena / znanih : null,
    poProduktih: produkti.map((pr) => ({
      produkt: pr,
      ime: IME_PRODUKTA[pr],
      pogodbena: vsota(novi.filter((p) => p.produkt === pr)),
      mrr: ponavljajoci.filter((p) => p.produkt === pr).reduce((a, p) => a + mrrPosla(p, konec), 0),
    })),
    casovnica: casovnicaPrazna.map((m) => ({ ...m, znesek: vsota(izbor.filter((p) => p.datum >= m.od && p.datum <= m.do)) })),
    novi,
    ponavljajoci,
  };
}

/** »Panic button: mesečno 49,90 € × 12 mes. = 598,80 €« za vrstico v predalu. */
export function opisPosla(p: PoselVrednost): string {
  const e = (v: number) => new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(v);
  const osnova = `${IME_PRODUKTA[p.produkt] ?? p.produkt}: ${VRSTA_PLACILA[p.vrsta]} ${e(p.znesek)}`;
  if (p.vrsta === "enkratno") return osnova;
  const v = pogodbenaVrednost(p);
  return `${osnova}${v !== null ? ` × ${p.trajanje} mes. = ${e(v)}` : ", trajanje ni vpisano (pogodbena vrednost N/A)"}`;
}

/** Posli kot vrstice predala (ena na posel; dan je datum sklenitve). */
export function posliZaPredal(posli: PoselVrednost[]): Dogodek[] {
  return posli.map((p) => ({ cas: `${p.datum} 00:00`, korak: "posel", domena: p.domena, produkt: p.produkt, razlog: opisPosla(p) }));
}

// ——— prihodki iz aplikacije Kompletko (spremstvo in fizično varovanje, samo branje) ———

export type NalogAplikacije = { datum: string; vrsta: string; znesek: number | null };

export type PrihodkiAplikacije = {
  /** Razlog za N/A (povezava ni nastavljena ali baza ne odgovarja); null = podatki so. */
  na: string | null;
  /** Cena za stranko in dodatni stroški opravljenih nalogov v obdobju (samo z znano ceno). */
  skupaj: number | null;
  nalogov: number;
  brezCene: number;
  /** Po vrsti naloga iz aplikacije (escort, static …). */
  poVrsti: { vrsta: string; nalogov: number; znesek: number | null }[];
};

/** Opravljeni nalogi iz aplikacije za obdobje, po vrsti naloga (static = fizično varovanje, ena oseba na lokaciji; Luka 7. 11. 2026). */
export function povzetekAplikacije(nalogi: NalogAplikacije[] | null, napaka: string | null, r: Razpon): PrihodkiAplikacije {
  if (!nalogi) return { na: napaka ?? "Povezava z aplikacijo Kompletko še ni nastavljena.", skupaj: null, nalogov: 0, brezCene: 0, poVrsti: [] };
  const v = nalogi.filter((x) => vRazponu(x.datum, r));
  const znani = v.filter((x) => x.znesek !== null);
  const vrste = [...new Set(v.map((x) => x.vrsta))].sort();
  return {
    na: null,
    skupaj: znani.length ? znani.reduce((a, x) => a + (x.znesek as number), 0) : v.length ? null : 0,
    nalogov: v.length,
    brezCene: v.length - znani.length,
    poVrsti: vrste.map((vr) => {
      const t = v.filter((x) => x.vrsta === vr);
      const z = t.filter((x) => x.znesek !== null);
      return { vrsta: vr, nalogov: t.length, znesek: z.length ? z.reduce((a, x) => a + (x.znesek as number), 0) : null };
    }),
  };
}
