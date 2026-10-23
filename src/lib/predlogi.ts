import "server-only";
import { cache } from "react";

/**
 * Predlogi strani: »tako bi lahko izgledala vaša nova stran« za podjetje, ki
 * mu piše prodajna ekipa.
 *
 * Vsebino pripravi Harvey (harvey/predlogi.py, isti računalnik, 127.0.0.1:5555)
 * samo iz javnih podatkov podjetja — njihove strani in registra — in jo hrani
 * pri sebi. kodatim.si/predlog/<koda> jo le prebere. Koda je naključna
 * (48 bitov), zato predloga ne najde nihče, ki povezave ni dobil; preverimo jo,
 * preden gre v URL proti Harveyju.
 */

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";
const KODA = /^[A-Za-z0-9_-]{6,20}$/;

export type Funkcija = "rezervacija" | "narocilo" | "povprasevanje" | "ai_asistent" | "portal";

/**
 * Demo nove strani v treh paketih (»kot pri Kamenariču«, Luka 20. 10. 2026):
 * besedila iz njihovih javnih podatkov, slike pa se nalagajo z njihove strani
 * (pri nas niso shranjene). Številke so samo tiste, ki dobesedno pišejo v
 * raziskavi.
 */
export type DemoVsebina = {
  nadnaslov: string;
  naslov: string;
  podnaslov: string;
  poziv: string;
  stevilke: { vrednost: string; oznaka: string }[];
  ponudba_naslov: string;
  ponudba: { ime: string; opis: string; slika: string }[];
  prednosti: { naslov: string; opis: string }[];
  o_nas: string;
  koraki: string[];
  vprasanja: { v: string; o: string }[];
  google: { naslov: string; opis: string };
  iskanja: string[];
  aplikacija: {
    naslov: string;
    opis: string;
    artikli: { ime: string; opis: string }[];
    /** Polja njihove panoge (mere, material, logotip …) — konfigurator v paketu 3. */
    polja?: PoljeKonfiguratorja[];
    /** Kaj stranka dobi po oddaji. */
    rezultat?: string;
  };
  paketi: Record<"1" | "2" | "3", string[]>;
  paketi_zakaj: Record<"1" | "2" | "3", string>;
  logo: string;
  barva: string;
  slike: string[];
  kontakt?: { telefon?: string; email?: string; naslov?: string };
};

export type PoljeKonfiguratorja = {
  ime: string;
  vrsta: "stevilo" | "izbira" | "datoteka" | "besedilo";
  enota?: string;
  moznosti?: string[];
};

/** Na čem stoji predlog: prebrane strani in ugotovitve z viri (za Lukov pregled). */
export type Raziskava = {
  prebrano: string;
  strani: { url: string; vrsta: string }[];
  dejstva: { id: string; besedilo: string; vir: string; vrsta: string; datum: string }[];
};

/**
 * Načrt strani, ki ga napiše prodajni agent (Harvey, harvey/agent.py): kateri bloki,
 * v kakšnem vrstnem redu, katera različica, pisava in podlaga. Bloki so preizkušeni
 * (AgentStran), zato je vsaka stran drugačna, a nobena ne more biti zlomljena.
 */
export type StranAgenta = {
  tema: { pisava: string; podlaga: "svetla" | "kamen" | "temna"; oblika: "ostra" | "mehka" };
  glava: {
    razlicica: "fotografija" | "razdeljena" | "tipografska" | "okvir";
    nadnaslov: string;
    naslov: string;
    podnaslov: string;
    poziv: string;
    slike: string[];
  };
  bloki: BlokAgenta[];
};

export type BlokAgenta = {
  tip: "ponudba" | "resitev" | "stevilke" | "prednosti" | "o_nas" | "galerija" | "koraki" | "vprasanja" | "poziv";
  razlicica: string;
  naslov: string;
  uvod: string;
  elementi?: Record<string, string>[];
  slike?: string[];
  slika?: string;
  besedilo?: string;
  gumb?: string;
};

/** Agentovo razmišljanje: diagnoza z dokazi, rešitev, izbrani paket, ocena kritika. */
export type DeloAgenta = {
  diagnoza: {
    kaj_delajo: string;
    kupci: string;
    kako_kupujejo_danes: string;
    problemi: { problem: string; dokaz: string; citat: string; posledica: string; gotovost: string }[];
    odlocitev: string;
    razlog: string;
  };
  resitev: {
    ime: string;
    povzetek: string;
    kako_deluje: string[];
    pred_po: { zdaj: string; potem: string }[];
    kaj_dobijo: { naslov: string; opis: string }[];
    pripomocek: Funkcija;
    artikli: { ime: string; opis: string }[];
    polja: PoljeKonfiguratorja[];
    rezultat: string;
  };
  paket: { st: "1" | "2" | "3"; ime3: string; ai: boolean; oglasevanje: boolean; zakaj: string };
  ocena?: { povprecje: number; povzetek: string };
  /** Prvi zaslon za 5 sekund (od 23. 10. 2026); starejši predlogi ga nimajo. */
  hero?: HeroAgenta;
};

export type HeroAgenta = {
  problem: string;
  resitev: string;
  danes: string[];
  potem: string[];
  vrednost: string;
};

/** Paket iz Lukovega cenika; cena je shranjena s predlogom, da ponudba ostane, kakršna je bila poslana. */
export type Paket = { st: string; ime: string; cena: string; opis: string; priporocen: boolean };

export type Predlog = {
  koda: string;
  naslov: string;
  podnaslov: string;
  storitve: { ime: string; opis: string }[];
  poziv: string;
  funkcija: Funkcija;
  funkcija_opis: string;
  izboljsave: { ugotovitev: string; resitev: string }[];
  /** »Zakaj se vam splača« — tri alineje kot v Lukovem mailu Kamenariču. */
  zakaj?: { naslov: string; besedilo: string }[];
  cene?: Paket[];
  mesecnina?: string;
  garancija?: string;
  /** Drobni tisk garancije: kako se meri »povpraševanje«. */
  garancija_pogoji?: string;
  /** Priloge, ki že obstajajo (npr. "ponudba.pdf"). */
  priloge?: string[];
  podjetje: string;
  kratko_ime: string;
  domena: string;
  kraj: string;
  dejavnost: string;
  pomanjkljivosti: string[];
  ima_posnetek: boolean;
  ustvarjeno: string;
  ogledov: number;
  /** Cela demo stran v treh paketih; brez nje je predlog stare oblike. */
  demo?: DemoVsebina;
  raziskava?: Raziskava;
  /** Predlog prodajnega agenta: njihova stran po agentovem načrtu in njegovo delo. */
  stran?: StranAgenta;
  agent?: DeloAgenta;
  vizual?: { logo: string; barva: string };
  kontakt?: { telefon?: string; email?: string; naslov?: string };
};

/** Priloge prvega maila, kot jih hrani Harvey. */
export const PRILOGE = {
  "ponudba.pdf": "application/pdf",
  "predogled-racunalnik.jpg": "image/jpeg",
  "predogled-telefon.jpg": "image/jpeg",
} as const;
export type ImePriloge = keyof typeof PRILOGE;

export type BranjePredloga =
  | { stanje: "ok"; predlog: Predlog }
  | { stanje: "ni" }
  | { stanje: "nedosegljiv" };

export function veljavnaKoda(koda: string): boolean {
  return KODA.test(koda);
}

/** Enkrat na izris: metapodatki in stran ga bereta iz istega klica. */
export const preberiPredlog = cache(async (koda: string): Promise<BranjePredloga> => {
  if (!veljavnaKoda(koda)) return { stanje: "ni" };
  try {
    const r = await fetch(`${HARVEY}/api/predlog/${koda}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 404) return { stanje: "ni" };
    if (!r.ok) return { stanje: "nedosegljiv" };
    return { stanje: "ok", predlog: (await r.json()) as Predlog };
  } catch {
    return { stanje: "nedosegljiv" };
  }
});

/** Posnetek njihove sedanje strani na telefonu (JPEG ali PNG) ali null. */
export async function preberiPosnetek(koda: string): Promise<{ vsebina: ArrayBuffer; vrsta: string } | null> {
  if (!veljavnaKoda(koda)) return null;
  try {
    const r = await fetch(`${HARVEY}/api/predlog/${koda}/posnetek`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const vrsta = r.headers.get("content-type")?.startsWith("image/jpeg") ? "image/jpeg" : "image/png";
    return { vsebina: await r.arrayBuffer(), vrsta };
  } catch {
    return null;
  }
}

/** PDF ponudba ali slika predogleda, kot gre v mail (le tri dovoljena imena). */
export async function preberiPrilogo(koda: string, ime: string): Promise<ArrayBuffer | null> {
  if (!veljavnaKoda(koda) || !(ime in PRILOGE)) return null;
  try {
    const r = await fetch(`${HARVEY}/api/predlog/${koda}/priloga/${ime}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Šteje ogled, da ekipa ve, kdo je predlog odprl. */
export async function zabeleziOgled(koda: string): Promise<boolean> {
  if (!veljavnaKoda(koda)) return false;
  try {
    const r = await fetch(`${HARVEY}/api/predlog/${koda}/ogled`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
