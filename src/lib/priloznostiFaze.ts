/**
 * Življenjski cikel priložnosti (Harvey, harvey/priloznosti.py). Ločen modul
 * brez "server-only", ker ga uporabljata tudi obrazca v brskalniku.
 */

export const FAZE = [
  "odkrito",
  "raziskovanje",
  "dokazi_zbrani",
  "ocenjevanje",
  "potrebna_validacija",
  "validirano",
  "ponudba",
  "pridobivanje",
  "prodaja",
  "dobljeno",
  "izgubljeno",
  "zavrnjeno",
] as const;
export type Faza = (typeof FAZE)[number];

export const OZNAKE_FAZ: Record<Faza, string> = {
  odkrito: "Odkrito",
  raziskovanje: "Raziskovanje",
  dokazi_zbrani: "Dokazi zbrani",
  ocenjevanje: "Ocenjevanje",
  potrebna_validacija: "Potrebna validacija",
  validirano: "Validirano",
  ponudba: "Ponudba pripravljena",
  pridobivanje: "Pridobivanje strank",
  prodaja: "Prodaja",
  dobljeno: "Dobljeno",
  izgubljeno: "Izgubljeno",
  zavrnjeno: "Zavrnjeno",
};

/** Faze, za katere mora Luka zapisati resničen signal (pogovor, pilot, naročilo), ne besedilo modela. */
export const FAZE_S_SIGNALOM: readonly Faza[] = ["validirano", "ponudba", "pridobivanje", "prodaja", "dobljeno", "izgubljeno"];
