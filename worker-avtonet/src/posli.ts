import type { Identiteta } from "./identiteta.js";

/**
 * Motor primerljivcev in poslov 2.0.
 *
 * Vodilo, ki loči to od prejšnje različice: najprej se ugotovi, KATERI avto je
 * oglas, šele nato, kateri drugi avti so zares primerljivi, in šele nato, ali
 * je cena zanimiva. Kjer identitete ni mogoče zanesljivo ugotoviti, sistem
 * ne pokaže posla — raje 20 poslov, ki jih je mogoče zagovarjati, kot 200,
 * ki jih ni.
 *
 * Vsak primerljivec nosi razlog, zakaj je bil vzet, in vsak zavrnjeni razlog,
 * zakaj ne. Če posla ni mogoče razložiti, po definiciji ni dovolj dober.
 */

export type Vozilo = {
  id: string;
  avtonetId: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  cena: number;
  jeDealer: boolean | null;
  status: string;
  statusSpremenjen: string | null;
  firstSeen: string;
  identiteta: Identiteta;
  cenaPrimerljiva: boolean;
  razlogIzkljucitve: string | null;
  ddvOdbitek: boolean;
  cenaBrezDdv: number | null;
};

export type Stopnja = 1 | 2 | 3 | 4;

export type Ujemanje = {
  stopnja: Stopnja;
  enako: string[];
  razlika: string[];
  /** Zakaj NE more biti višje stopnje; prazno, kadar je stopnja 1. */
  ovire: string[];
};

const IME_STOPNJE: Record<Stopnja, string> = {
  1: "identičen",
  2: "zelo blizu",
  3: "podoben",
  4: "širši trg",
};

export function imeStopnje(s: Stopnja): string {
  return IME_STOPNJE[s];
}

/** Oprema, katere odsotnost oz. prisotnost loči avta v različna razreda. */
const KRITICNA_OPREMA = [
  "zracno_vzmetenje",
  "adaptivno_vzmetenje",
  "keramicne_zavore",
  "sport_chrono",
  "zadnje_krmiljenje",
  "sport_diferencial",
];

/**
 * Kako blizu sta si dva avta.
 *
 * Kritično neujemanje (druga izvedenka, drug pogon, ročni proti PDK, cabrio
 * proti coupéju) prepove stopnji 1 in 2, ne glede na to, koliko drugega se
 * ujema. To je pravilo, ki je prej manjkalo: 911 GTS in Carrera 4S se ujemata
 * v 90 % podatkov, cenovno pa sta dva različna avta.
 */
export function ujemanje(a: Vozilo, b: Vozilo): Ujemanje {
  const ia = a.identiteta;
  const ib = b.identiteta;
  const enako: string[] = [];
  const razlika: string[] = [];
  const ovire: string[] = [];

  if (ia.druzinaModela !== ib.druzinaModela) {
    return { stopnja: 4, enako: [], razlika: ["drug model"], ovire: ["drug model"] };
  }
  enako.push(ia.druzinaModela);

  // Generacija: neznana na eni strani ne sme šteti za razliko, znana in
  // različna pa je resna ovira.
  if (ia.generacija && ib.generacija) {
    if (ia.generacija === ib.generacija) enako.push(`generacija ${ia.generacija}`);
    else {
      razlika.push(`generacija ${ib.generacija} proti ${ia.generacija}`);
      ovire.push("druga generacija");
    }
  }

  if (ia.izvedenka && ib.izvedenka) {
    if (ia.izvedenka === ib.izvedenka) enako.push(`izvedenka ${ia.izvedenka}`);
    else {
      razlika.push(`izvedenka ${ib.izvedenka} proti ${ia.izvedenka}`);
      ovire.push("druga izvedenka");
    }
  } else {
    ovire.push("izvedenka ni znana");
    razlika.push("izvedenka neznana");
  }

  if (ia.gorivo !== ib.gorivo) {
    return { stopnja: 4, enako, razlika: [...razlika, "drugo gorivo"], ovire: ["drugo gorivo"] };
  }
  enako.push(ia.gorivo);

  // Pogon in menjalnik štejeta le, kadar sta na obeh straneh znana: vir ju
  // pogosto ne zapiše, in "neznano" ni razlika.
  if (ia.pogon !== "?" && ib.pogon !== "?") {
    if (ia.pogon === ib.pogon) enako.push(`pogon ${ia.pogon}`);
    else {
      razlika.push(`pogon ${ib.pogon} proti ${ia.pogon}`);
      ovire.push("drug pogon");
    }
  }

  const rocni = (v: string) => v === "rocni";
  if (ia.menjalnikDruzina !== "?" && ib.menjalnikDruzina !== "?") {
    if (ia.menjalnikDruzina === ib.menjalnikDruzina) enako.push(`menjalnik ${ia.menjalnikDruzina}`);
    else if (rocni(ia.menjalnikDruzina) !== rocni(ib.menjalnikDruzina)) {
      // Ročni proti samodejnemu je vedno ovira; dve različni samodejni
      // (PDK proti tiptronicu) pa le razlika.
      razlika.push(`menjalnik ${ib.menjalnikDruzina} proti ${ia.menjalnikDruzina}`);
      ovire.push("ročni proti samodejnemu");
    } else {
      razlika.push(`menjalnik ${ib.menjalnikDruzina}`);
    }
  }

  if (ia.karoserija !== ib.karoserija && ia.karoserija !== "?" && ib.karoserija !== "?") {
    razlika.push(`karoserija ${ib.karoserija}`);
    ovire.push("druga karoserija");
  } else if (ia.karoserija !== "?") {
    enako.push(ia.karoserija);
  }

  // Moč: dovoljen razmik raste s stopnjo. Znotraj iste izvedenke gre navadno
  // za lifting ali drugačno programsko opremo, ne za drug avto.
  const mocRazlika =
    a.kw && b.kw ? Math.abs(a.kw - b.kw) / a.kw : null;
  if (mocRazlika !== null) {
    if (mocRazlika <= 0.08) enako.push(`${b.kw} kW`);
    else {
      razlika.push(`${b.kw} kW proti ${a.kw} kW`);
      if (mocRazlika > 0.2) ovire.push("bistveno druga moč");
    }
  }

  // Kritična oprema: kdor jo ima, ni v istem razredu kot tisti brez nje.
  const razlikeOpreme = KRITICNA_OPREMA.filter(
    (k) => Boolean(ia.oprema[k]) !== Boolean(ib.oprema[k])
  );
  if (razlikeOpreme.length > 0) {
    razlika.push(...razlikeOpreme.map((k) => `${k.replace(/_/g, " ")}: ${ib.oprema[k] ? "ima" : "nima"}`));
    if (razlikeOpreme.length >= 2) ovire.push("bistveno drugačna ključna oprema");
  }

  const letnikRazlika = a.letnik !== null && b.letnik !== null ? Math.abs(a.letnik - b.letnik) : null;
  const kmRazlika = a.km !== null && b.km !== null && a.km > 0 ? Math.abs(a.km - b.km) / a.km : null;

  // Absolutna razlika v kilometrih je enako pomembna kot relativna: 40 % od
  // 200.000 km je 80.000 km in to ni isti avto, čeprav odstotek prestane.
  const kmAbs = a.km !== null && b.km !== null ? Math.abs(a.km - b.km) : null;

  let stopnja: Stopnja;
  if (
    ovire.length === 0 && (letnikRazlika ?? 9) <= 1 && (kmRazlika ?? 9) <= 0.25 &&
    (kmAbs ?? 9e9) <= 35_000 && razlikeOpreme.length === 0
  ) {
    stopnja = 1;
  } else if (ovire.length === 0 && (letnikRazlika ?? 9) <= 2 && (kmRazlika ?? 9) <= 0.35 && (kmAbs ?? 9e9) <= 60_000) {
    stopnja = 2;
  } else if (ovire.every((o) => o === "izvedenka ni znana") && (letnikRazlika ?? 9) <= 3) {
    // Neznana izvedenka je edina ovira, ki ne izključi stopnje 2 dokončno –
    // avto ostane uporaben kot kontekst, ne pa kot dokaz.
    stopnja = 3;
  } else if ((letnikRazlika ?? 9) <= 4) {
    stopnja = 3;
  } else {
    stopnja = 4;
  }

  if (letnikRazlika !== null && letnikRazlika > 0) razlika.push(`letnik ${b.letnik}`);
  if (b.km !== null) {
    const kmB = `${b.km.toLocaleString("sl-SI")} km`;
    if ((kmRazlika ?? 0) > 0.05) razlika.push(kmB);
    else enako.push(kmB);
  }

  return { stopnja, enako, razlika, ovire };
}

// ------------------------------------------------------------- prilagoditev

export type Koeficienta = { naKm: number; naLeto: number };

/**
 * Koliko km in leto premakneta ceno V TEJ skupini.
 *
 * Mediana naklonov med vsemi pari je odporna na posamezne čudne oglase, kar
 * povprečje ni. Sanity: kilometri smejo ceno samo nižati, leto samo višati —
 * skupina, ki trdi nasprotno, govori o svojem šumu, ne o trgu.
 */
export function koeficienti(vzorec: Vozilo[]): Koeficienta {
  const kmN: number[] = [];
  const letoN: number[] = [];
  for (let i = 0; i < vzorec.length; i++) {
    for (let j = i + 1; j < vzorec.length; j++) {
      const a = vzorec[i];
      const b = vzorec[j];
      if (a.km !== null && b.km !== null && Math.abs(a.km - b.km) >= 20_000) {
        kmN.push((a.cena - b.cena) / (a.km - b.km));
      }
      if (a.letnik !== null && b.letnik !== null && Math.abs(a.letnik - b.letnik) >= 1) {
        letoN.push((a.cena - b.cena) / (a.letnik - b.letnik));
      }
    }
  }
  const naKm = kmN.length >= 6 ? (mediana(kmN) as number) : 0;
  const naLeto = letoN.length >= 6 ? (mediana(letoN) as number) : 0;
  return {
    naKm: Number.isFinite(naKm) && naKm < 0 ? naKm : 0,
    naLeto: Number.isFinite(naLeto) && naLeto > 0 ? naLeto : 0,
  };
}

/** Cena primerljivca, preračunana na km in letnik kandidata. */
export function prilagojenaCena(p: Vozilo, cilj: Vozilo, k: Koeficienta): number | null {
  let c = p.cena;
  if (p.km !== null && cilj.km !== null) c += (cilj.km - p.km) * k.naKm;
  if (p.letnik !== null && cilj.letnik !== null) c += (cilj.letnik - p.letnik) * k.naLeto;
  // Popravek nad petino cene pomeni, da primerljivec ni primerljiv.
  //
  // Prej je meja stala pri 35 % in je posle USTVARJALA: X5 s 140.000 km za
  // 49.990 € je po preračunu na kandidatovih 110.000 km postal vreden 62.143 €,
  // s čimer je tržna vrednost zrasla nad ceno vsakega resničnega oglasa v
  // skupini. Popravek sme razliko zgladiti, ne pa je izmisliti.
  const meja = p.cena * 0.2;
  if (Math.abs(c - p.cena) > meja) return null;
  return Math.round(c);
}

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Razpršenost: (P90 − P10) / mediana. Nad 60 % trg ni izmerljiv. */
export function razprsenost(cene: number[]): number | null {
  if (cene.length < 5) return null;
  const s = [...cene].sort((a, b) => a - b);
  const m = mediana(s) as number;
  if (!m) return null;
  return (s[Math.floor(s.length * 0.9)] - s[Math.floor(s.length * 0.1)]) / m;
}

// ------------------------------------------------------------------- posli

export type Primerljivec = {
  avtonetId: string;
  naziv: string | null;
  letnik: number | null;
  km: number | null;
  cena: number;
  prilagojena: number;
  url: string;
  stopnja: Stopnja;
  jeDealer: boolean | null;
  enako: string[];
  razlika: string[];
};

export type Zavrnjen = {
  naziv: string | null;
  url: string;
  razlog: string;
};

export type Posel = {
  avtonetId: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  modelIme: string | null;
  model: string;
  cena: number;
  letnik: number | null;
  km: number | null;
  jeDealer: boolean | null;
  ddvOdbitek: boolean;
  cenaBrezDdv: number | null;

  /** Identiteta, na kateri stoji vse ostalo. */
  izvedenka: string | null;
  generacija: string | null;
  pogon: string;
  menjalnik: string;
  identitetaZaupanje: number;
  opremaTeza: number;
  kljucnaOprema: string[];

  /** Trg. */
  trznaVrednost: number;
  odstopanjePct: number;
  zasluzek: number;
  potencial: number;
  medianaIdenticnih: number | null;
  medianaZeloBlizu: number | null;
  medianaZasebnikov: number | null;
  medianaTrgovcev: number | null;
  medianaZakljucenih: number | null;
  vzorecIdenticnih: number;
  vzorecZeloBlizu: number;
  razprsenostPct: number | null;

  /** Zaupanje in razlaga. */
  zaupanjeUjemanja: number;
  zaupanjeTrga: number;
  zaupanjeSkupno: number;
  likvidnost: number | null;
  strogost: string;
  razlogi: string[];
  primerljivi: Primerljivec[];
  zavrnjeni: Zavrnjen[];
  prodani: {
    naziv: string;
    letnik: number | null;
    km: number | null;
    zadnjaCena: number;
    izginil: string | null;
    dniNaTrgu: number | null;
    url: string;
    stopnja: Stopnja;
  }[];
  /** Zakaj posla NI (kadar se kandidat ovrže) — za razhroščevanje. */
  vzorecTrgovcev: number;
  odstopanjeTrgovciPct: number | null;
  kmAnomalija: boolean;
  tocke: number;
};

export type Zavrnitev = { avtonetId: string; naziv: string | null; razlog: string };

/** Trde zapore: kandidat, ki pade skozi eno od teh, ne more biti posel. */
export function zaporaKandidata(v: Vozilo): string | null {
  if (!v.znamka || !v.model) return "manjka znamka ali model";
  if (v.letnik === null) return "manjka letnik";
  if (v.km === null) return "manjkajo kilometri";
  if (!v.cenaPrimerljiva) return v.razlogIzkljucitve ?? "cena ni primerljiva";
  if (v.cena < 1000) return "cena pod 1.000 €";
  if (v.identiteta.zaupanje < 50) return `identiteta ni zanesljiva (${v.identiteta.zaupanje}/100)`;
  return null;
}
