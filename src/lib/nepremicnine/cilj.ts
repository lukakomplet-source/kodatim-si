import type { InvesticijskiCilj } from "./poizvedba";
import { povrsinaZaIzracun } from "./verjetnost";

/**
 * Ocena kandidata proti investicijskemu cilju ("10 enot po 650 €, s prenovo
 * 700k") — čista aritmetika brez baze, da jo je mogoče testirati in razložiti.
 *
 * Ločnica virov, ista kot v kalkulatorju: potrjene enote so iz oglasa, ocena
 * enot je iz opisa ("možnost ureditve"), izpeljane enote iz m² so PREDPOSTAVKA
 * (30 m²/enoto) in so tako tudi označene. Najemnina je mediana €/m² iz NAŠIH
 * najemnih oglasov po regiji — nikoli izmišljena; brez vzorca je raje ni.
 */

/** Predpostavki, zapisani na enem mestu, ker se pokažeta tudi v UI. */
export const M2_NA_ENOTO_FILTER = 25; // spodnja meja pri iskanju kandidatov
export const M2_NA_ENOTO_OCENA = 30; // konservativna delitev pri oceni zmožnosti

export type NajemMediana = { naM2: number; vzorec: number };
/** Ključ je regija; "" je mediana cele Slovenije (rezerva). */
export type NajemMediane = Map<string, NajemMediana>;

/**
 * Mediane najemnin €/m² po regijah iz vrstic naših najemnih oglasov
 * (posel=oddaja, tip=stanovanje — enota hiše se oddaja kot stanovanje).
 */
export function najemMediane(
  vrstice: { regija: string | null; cena_eur: number | null; povrsina_m2: number | null }[]
): NajemMediane {
  const poRegijah = new Map<string, number[]>();
  const vse: number[] = [];
  for (const v of vrstice) {
    const m2 = povrsinaZaIzracun("stanovanje", v.povrsina_m2);
    if (v.cena_eur === null || m2 === null || m2 <= 10) continue;
    const naM2 = Number(v.cena_eur) / m2;
    if (!Number.isFinite(naM2) || naM2 <= 0) continue;
    vse.push(naM2);
    if (v.regija) {
      const arr = poRegijah.get(v.regija) ?? [];
      arr.push(naM2);
      poRegijah.set(v.regija, arr);
    }
  }
  const rezultat: NajemMediane = new Map();
  const zaokrozi = (x: number) => Math.round(x * 100) / 100;
  for (const [regija, arr] of poRegijah) {
    if (arr.length >= 5) rezultat.set(regija, { naM2: zaokrozi(mediana(arr)!), vzorec: arr.length });
  }
  if (vse.length >= 5) rezultat.set("", { naM2: zaokrozi(mediana(vse)!), vzorec: vse.length });
  return rezultat;
}

/**
 * OCENA NAJEMNINE ZA VSAK OGLAS, ne le za investicijski cilj.
 *
 * Mediane so ločene PO TIPU, ker se trgi ne obnašajo enako: stanovanje se
 * oddaja po drugem €/m² kot poslovni prostor, hiša pa se v praksi oddaja po
 * stanovanjskih cenah (najemnik plača bivalno površino, ne strehe). Zato hiša
 * uporabi stanovanjsko mediano, poslovni prostor svojo.
 *
 * Ključ je `tip|regija`; če za tip in regijo ni petih vzorcev, se poskusi tip
 * čez vso državo, in šele nato se odpove. Odpoved je pomembna: "ni ocene" je
 * pošten odgovor, izmišljena številka pa bi šla naravnost v izračun donosa.
 */
export function najemMedianePoTipu(
  vrstice: { tip: string | null; regija: string | null; cena_eur: number | null; povrsina_m2: number | null }[]
): NajemMediane {
  const skupine = new Map<string, number[]>();
  const dodaj = (kljuc: string, v: number) => {
    const arr = skupine.get(kljuc) ?? [];
    arr.push(v);
    skupine.set(kljuc, arr);
  };
  for (const v of vrstice) {
    if (!v.tip) continue;
    const m2 = povrsinaZaIzracun(v.tip, v.povrsina_m2);
    if (v.cena_eur === null || m2 === null || m2 <= 10) continue;
    const naM2 = Number(v.cena_eur) / m2;
    if (!Number.isFinite(naM2) || naM2 <= 0) continue;
    dodaj(`${v.tip}|`, naM2);
    if (v.regija) dodaj(`${v.tip}|${v.regija}`, naM2);
  }
  const rezultat: NajemMediane = new Map();
  for (const [kljuc, arr] of skupine) {
    if (arr.length >= 5) rezultat.set(kljuc, { naM2: Math.round(mediana(arr)! * 100) / 100, vzorec: arr.length });
  }
  return rezultat;
}

export type OcenaNajemnineOglasa = {
  /** Mesečna najemnina: iz oglasa (oddaja) ali ocenjena (prodaja). */
  mesecna: number;
  naM2: number;
  vzorec: number;
  /** Iz katere skupine je mediana — za pošten prikaz vira. */
  obmocje: string;
  /** Bruto donos: letna najemnina / cena. Null pri oddajnih oglasih. */
  brutoDonosPct: number | null;
};

/**
 * Koliko bi ta nepremičnina nesla v najem in kakšen donos je to pri njeni ceni.
 * Vrne null, kadar ni ne površine ne dovolj velikega vzorca — raje nič kot
 * številka, ki je nihče ne more braniti.
 */
export function oceniNajemninoOglasa(
  v: { tip: string | null; regija: string | null; povrsina_m2: number | null; cena_eur: number | null },
  mediane: NajemMediane
): OcenaNajemnineOglasa | null {
  if (!v.tip) return null;
  // Hiša se odda kot stanovanje: najemnik plača bivalno površino.
  const tipZaNajem = v.tip === "hisa" ? "stanovanje" : v.tip;
  const povrsina = povrsinaZaIzracun(v.tip, v.povrsina_m2);
  if (povrsina === null || povrsina <= 10) return null;

  const vRegiji = v.regija ? mediane.get(`${tipZaNajem}|${v.regija}`) : undefined;
  const vDrzavi = mediane.get(`${tipZaNajem}|`);
  const med = vRegiji ?? vDrzavi;
  if (!med) return null;

  const mesecna = Math.round(med.naM2 * povrsina);
  const cena = v.cena_eur === null ? null : Number(v.cena_eur);
  return {
    mesecna,
    naM2: med.naM2,
    vzorec: med.vzorec,
    obmocje: vRegiji && v.regija ? v.regija : "vsa Slovenija",
    brutoDonosPct: cena !== null && cena > 1000 ? Math.round(((mesecna * 12) / cena) * 1000) / 10 : null,
  };
}

function mediana(vrednosti: number[]): number | null {
  if (vrednosti.length === 0) return null;
  const s = [...vrednosti].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type KandidatZaOceno = {
  cena_eur: number | null;
  povrsina_m2: number | null;
  tip?: string | null;
  regija: string | null;
  st_enot: number | null;
  st_enot_ocena: number | null;
  vec_enot: boolean;
  za_obnovo: boolean;
  za_investicijo: boolean;
  cena_prvotna_eur: number | null;
};

export type OcenaKandidata = {
  /** Koliko enot objekt zmore in od kod to vemo. */
  zmoznostEnot: number | null;
  enoteVir: "potrjeno" | "ocena" | "iz_povrsine" | null;
  /** Ocena najemnine za ENO enoto pri ciljni delitvi (mediana regije × m²/enoto). */
  najemninaEnota: number | null;
  najemninaVzorec: number;
  najemninaObmocje: string | null;
  /** Kar od proračuna ostane za prenovo (in na m²). */
  zaPrenovo: number | null;
  zaPrenovoM2: number | null;
  /** Bruto donos pri ciljnem proračunu z OCENJENO najemnino. */
  brutoDonosPct: number | null;
  ocena: number; // 0–100, samo za razvrščanje
  oznaka: "ustreza" | "tesno" | "ne_doseze";
  /** Prodajna cena pod 10.000 € — skoraj gotovo napačen podatek vira. */
  cenaSumljiva: boolean;
  razlogi: string[];
};

export function oceniKandidata(
  cilj: InvesticijskiCilj,
  v: KandidatZaOceno,
  mediane: NajemMediane
): OcenaKandidata {
  const razlogi: string[] = [];
  // Nemogoča površina pri viru (izmerjeno: "hiša" s 239.000 m²) ne sme
  // postati "7.966 enot" — takrat velja, kot da površine ni.
  const povrsina = povrsinaZaIzracun(v.tip ?? null, v.povrsina_m2);
  if (povrsina === null && v.povrsina_m2 !== null) {
    razlogi.push(`površina ${v.povrsina_m2} m² pri viru ni mogoča — v izračunu je ne upoštevam`);
  }

  // Zmožnost enot: potrjeno > ocena iz opisa > izpeljano iz m².
  let zmoznostEnot: number | null = null;
  let enoteVir: OcenaKandidata["enoteVir"] = null;
  if (v.st_enot !== null && v.st_enot >= 2) {
    zmoznostEnot = v.st_enot;
    enoteVir = "potrjeno";
  } else if (v.st_enot_ocena !== null && v.st_enot_ocena >= 2) {
    zmoznostEnot = v.st_enot_ocena;
    enoteVir = "ocena";
  } else if (povrsina !== null && povrsina >= 2 * M2_NA_ENOTO_OCENA) {
    zmoznostEnot = Math.floor(povrsina / M2_NA_ENOTO_OCENA);
    enoteVir = "iz_povrsine";
  }

  const tezaVira = enoteVir === "potrjeno" ? 40 : enoteVir === "ocena" ? 34 : 26;
  let tocke = 0;
  if (zmoznostEnot !== null) {
    const delez = Math.min(1, zmoznostEnot / cilj.enote);
    const dobljeno = Math.round(tezaVira * delez);
    tocke += dobljeno;
    razlogi.push(`enote: ${zmoznostEnot} od ${cilj.enote} (${enoteVir}) +${dobljeno}`);
  } else {
    razlogi.push("enote: zmožnosti ni mogoče oceniti (ni m² niti enot) +0");
  }

  // Najemnina: mediana €/m² regije × ciljna velikost enote.
  const obmocje = v.regija && mediane.has(v.regija) ? v.regija : mediane.has("") ? "" : null;
  const med = obmocje !== null ? mediane.get(obmocje)! : null;
  let najemninaEnota: number | null = null;
  if (med && povrsina !== null && povrsina > 10) {
    najemninaEnota = Math.round(med.naM2 * (povrsina / cilj.enote));
  }
  if (najemninaEnota !== null) {
    if (cilj.najemninaNaEnoto !== null) {
      const razmerje = Math.min(1, najemninaEnota / cilj.najemninaNaEnoto);
      const dobljeno = Math.round(30 * razmerje);
      tocke += dobljeno;
      razlogi.push(`najemnina: ocena ${najemninaEnota} € proti cilju ${cilj.najemninaNaEnoto} € +${dobljeno}`);
    } else {
      tocke += 15;
      razlogi.push(`najemnina: ocena ${najemninaEnota} €/enoto, cilja ni +15`);
    }
  } else {
    razlogi.push("najemnina: ni ocene (premalo najemnih vzorcev ali ni m²) +0");
  }

  // Prenova: koliko denarja od proračuna sploh ostane.
  let zaPrenovo: number | null = null;
  let zaPrenovoM2: number | null = null;
  if (cilj.proracun !== null && v.cena_eur !== null) {
    zaPrenovo = cilj.proracun - Number(v.cena_eur);
    if (povrsina !== null && povrsina > 10) {
      zaPrenovoM2 = Math.round(zaPrenovo / povrsina);
      // 800 €/m² velja za celovito prenovo — nad tem polne točke.
      const dobljeno = zaPrenovo <= 0 ? 0 : Math.round(20 * Math.min(1, zaPrenovoM2 / 800));
      tocke += dobljeno;
      razlogi.push(`prenova: ostane ${Math.round(zaPrenovo / 1000)}k (${zaPrenovoM2} €/m²) +${dobljeno}`);
    } else {
      const dobljeno = zaPrenovo <= 0 ? 0 : Math.round(20 * Math.min(1, zaPrenovo / cilj.proracun / 0.4));
      tocke += dobljeno;
      razlogi.push(`prenova: ostane ${Math.round(zaPrenovo / 1000)}k +${dobljeno}`);
    }
  }

  // Značke iz opisa — bonus, ne pogoj.
  let bonus = 0;
  if (v.za_obnovo) bonus += 4;
  if (v.za_investicijo) bonus += 3;
  if (v.cena_prvotna_eur !== null && v.cena_eur !== null && Number(v.cena_eur) < Number(v.cena_prvotna_eur)) bonus += 3;
  if (bonus > 0) {
    tocke += bonus;
    razlogi.push(`značke (obnova/investicija/znižano) +${bonus}`);
  }

  // Prodaja pod 10.000 € za tak objekt je skoraj gotovo napačen podatek vira
  // (najemnina ali €/m² v polju cene) — ocena se prepolovi, opozorilo ostane
  // vidno, oglas pa ni skrit: presodi človek pri viru.
  const cenaSumljiva = v.cena_eur !== null && Number(v.cena_eur) < 10_000;
  if (cenaSumljiva) {
    tocke = Math.round(tocke / 2);
    razlogi.push("cena pod 10.000 € — sumljiv podatek vira, ocena prepolovljena");
  }

  const brutoDonosPct =
    cilj.proracun !== null && najemninaEnota !== null
      ? Math.round(((cilj.enote * najemninaEnota * 12) / cilj.proracun) * 1000) / 10
      : null;

  const ocena = Math.max(0, Math.min(100, tocke));
  let oznaka: OcenaKandidata["oznaka"] =
    zaPrenovo !== null && zaPrenovo <= 0 ? "ne_doseze" : ocena >= 70 ? "ustreza" : ocena >= 45 ? "tesno" : "ne_doseze";
  if (cenaSumljiva && oznaka === "ustreza") oznaka = "tesno";

  return {
    zmoznostEnot,
    enoteVir,
    najemninaEnota,
    najemninaVzorec: med?.vzorec ?? 0,
    najemninaObmocje: obmocje === "" ? "vsa Slovenija" : obmocje,
    zaPrenovo,
    zaPrenovoM2,
    brutoDonosPct,
    ocena,
    oznaka,
    cenaSumljiva,
    razlogi,
  };
}
