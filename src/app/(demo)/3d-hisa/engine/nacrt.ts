/**
 * Specifikacija PO PZI NAČRTIH (Arhivitae 281/25) — kategorija A, razen kjer
 * je označeno B (inferirano) ali C (poenostavitev). Vir: docs/vojnik-nacrti/
 * ARHITEKTURA_PZI_ZDRUZENO.pdf (tlorisi list 1, 6, 7, 8; fasade list 11;
 * prereza list 5; situacija list 15) + HOUSE_ANALYSIS.md.
 *
 * Svet: X+ = vzhod, Z+ = jug, Y+ = gor. Hiša centrirana na (0,0).
 * PZI tlorisi so risani z VZHODOM navzgor; tu je vse pretvorjeno v svet.
 */

export const NACRT = {
  // gabarit (A): vzhodna kotirna veriga 3,02 + 5,05 + 2,83 = 10,90
  sirinaSJ: 10.9, // sever–jug (A)
  globinaVZ: 9.3, // vzhod–zahod (A)
  // etaže (A, prereza A-A/B-B)
  pritlicjeTla: 0.0,
  pritlicjeStrop: 2.46,
  ploscaD: 0.25, // obstoječa monta plošča
  nadstropjeTla: 2.71,
  nadstropjeStrop: 5.21,
  podstrehaTla: 5.46,
  kolencna: 1.16, // kap na +6.62
  slemeY: 9.16, // podstreha +3.70 (A); sleme teče S–J; 276,61 m n. v. (situacija)
  // streha (A: Prefa-Prefalz; naklon izračunan iz prereza)
  previsKap: 0.45, // B
  previsCelo: 0.35, // B
  // balkon ob zahodni fasadi (nadstropje, čez fasado; A na fasadah)
  balkonGlobina: 1.35,
  balkonY: 2.71,
  // zunanje stopnišče — prizidava na VZHODNI fasadi (A, listi stopnišča)
  stopnisce: {
    dolzinaSJ: 5.05,
    globinaVZ: 2.88,
    odSevernegaRoba: 3.02, // A (tloris pritličja)
    visinaStolpa: 7.2, // A (prerezi stopnišča)
    podestSirina: 1.15,
    // raster jeklenih stebrov HOP 100/100/3 vzdolž S–J stranice (A, tloris):
    // 0,15 steber + 0,97 + 0,15 + 2,52 + 0,15 + 0,96 + 0,15 = 5,05
    stebriOdmiki: [0.075, 1.195, 3.86, 4.975], // sredine stebrov od severnega roba stolpa
  },
  // frčada na ZAHODNI strešini (A: O6 134/300; širina po fasadi ~4,2)
  frcada: {
    sredinaZ: -0.2, // B: nad dnevnim prostorom podstrehe
    sirina: 4.2, // A (fasada zahod): okno 3,00 + špaleti
    oknoW: 3.0,
    oknoH: 1.34,
    parapet: 0.9, // B
    celoX: -4.0, // B: čelo ~0.65 m pred ravnino fasade
    strehaDo: -1.1, // B: enokapnica frčade se priključi na strešino
  },
} as const;

export type Etaza = "pritlicje" | "nadstropje" | "podstreha";

/**
 * KATALOG STAVBNEGA POHIŠTVA (A — sheme, lista 10 in 11).
 * Ena definicija na tip; instance so v ODPRTINE/VRATA_NOTRANJA po id-ju tipa.
 */
export type OknoTip = {
  w: number;
  h: number;
  opis: string;
  krila: number; // navpične delitve zasteklitve
  vrsta: "okno" | "vrata" | "balkonska" | "fiksno";
};

export const OKNA_TIPI = {
  O1: { w: 0.61, h: 0.4, opis: "O1 61/40 — malo okno kopalnice", krila: 1, vrsta: "okno" },
  O2: { w: 1.0, h: 2.0, opis: "O2 100/200 — fiksna zasteklitev (mahagoni)", krila: 1, vrsta: "fiksno" },
  O3: { w: 1.3, h: 1.2, opis: "O3 130/120", krila: 2, vrsta: "okno" },
  O4: { w: 1.18, h: 1.18, opis: "O4 118/118", krila: 2, vrsta: "okno" },
  O5: { w: 2.3, h: 2.1, opis: "O5 90+140/210 — balkonska vrata z oknom", krila: 3, vrsta: "balkonska" },
  O5V: { w: 0.95, h: 2.1, opis: "O5 95/210 — balkonska vrata", krila: 1, vrsta: "balkonska" },
  O6: { w: 3.0, h: 1.34, opis: "O6 134/300 — štirikrilno okno frčade", krila: 4, vrsta: "okno" },
  OM: { w: 0.6, h: 0.6, opis: "malo okno (obstoječe)", krila: 1, vrsta: "okno" },
  OP: { w: 1.2, h: 1.2, opis: "okno zatrepa podstrehe", krila: 2, vrsta: "okno" },
  ZV1: { w: 1.4, h: 2.1, opis: "ZV1 100+40/210 — vhod pritličja", krila: 2, vrsta: "vrata" },
  ZV2: { w: 0.8, h: 2.1, opis: "ZV2 80/210 — vrata kurilnice", krila: 1, vrsta: "vrata" },
  ZV3: { w: 1.0, h: 2.0, opis: "ZV3 — novo okno v vratni odprtini", krila: 1, vrsta: "okno" },
  ZV3S: { w: 2.13, h: 2.1, opis: "ZV3 103+110/210 — okno in vrata", krila: 2, vrsta: "vrata" },
  ZV4: { w: 1.0, h: 2.1, opis: "ZV4 100/210 — vhod s stopnišča", krila: 1, vrsta: "vrata" },
  ZV4S: { w: 2.2, h: 2.1, opis: "220/210 — vrata in okno dnevnega", krila: 3, vrsta: "vrata" },
} as const satisfies Record<string, OknoTip>;

export type OknoTipId = keyof typeof OKNA_TIPI;

export type VrataTip = { w: number; h: number; opis: string; zastekljena?: boolean };

export const VRATA_TIPI = {
  V1: { w: 0.84, h: 2.1, opis: "V1 84/210 (laminat, kljuka INOX mat)" },
  V2: { w: 0.95, h: 2.1, opis: "V2 95/210" },
  V3: { w: 0.95, h: 2.1, opis: "V3 95/210 — zastekljena", zastekljena: true },
  V4: { w: 0.75, h: 2.1, opis: "V4 75/210" },
} as const satisfies Record<string, VrataTip>;

export type VrataTipId = keyof typeof VRATA_TIPI;

/** Sobe: pravokotniki v svetu (B — digitalizirano iz tlorisov M 1:50, ±10 cm). */
export type Soba = {
  ime: string;
  povrsina: string; // iz načrta (A)
  etaza: Etaza;
  x1: number; z1: number; x2: number; z2: number;
  tla: "granitogres" | "travertin" | "abacus";
};

const polS = NACRT.sirinaSJ / 2; // 5.45
const polG = NACRT.globinaVZ / 2; // 4.65

/**
 * PRITLIČJE (tloris list 8). Vzhodni pas: kurilnica, kopalnica, kuhinja;
 * JV soba (3,20 × 3,34); zahodni pas: spalnica (3,20 globine); sredina:
 * vetrolov + predprostor; jug in zahod: dnevni prostor.
 */
export const SOBE: readonly Soba[] = [
  // pritličje
  { ime: "Kurilnica", povrsina: "5,66 m²", etaza: "pritlicje", x1: 1.9, z1: -polS + 0.25, x2: polG - 0.3, z2: -2.87, tla: "granitogres" },
  { ime: "Kopalnica", povrsina: "4,61 m²", etaza: "pritlicje", x1: 1.9, z1: -2.72, x2: polG - 0.3, z2: -0.82, tla: "travertin" },
  { ime: "Kuhinja (dnevni)", povrsina: "del 30,72 m²", etaza: "pritlicje", x1: 1.9, z1: -0.67, x2: polG - 0.3, z2: 1.3, tla: "granitogres" },
  { ime: "Soba", povrsina: "10,69 m²", etaza: "pritlicje", x1: 1.01, z1: 1.3, x2: polG - 0.3, z2: 4.5, tla: "granitogres" },
  { ime: "Vetrolov", povrsina: "5,92 m²", etaza: "pritlicje", x1: -1.15, z1: -polS + 0.25, x2: 1.75, z2: -2.9, tla: "granitogres" },
  { ime: "Predprostor", povrsina: "2,95 m²", etaza: "pritlicje", x1: -1.15, z1: -2.9, x2: 0.6, z2: -0.95, tla: "granitogres" },
  { ime: "Spalnica", povrsina: "14,40 m²", etaza: "pritlicje", x1: -polG + 0.3, z1: -polS + 0.25, x2: -1.15, z2: -0.7, tla: "granitogres" },
  { ime: "Dnevni prostor", povrsina: "30,72 m²", etaza: "pritlicje", x1: -polG + 0.3, z1: -0.7, x2: 1.9, z2: polS - 0.25, tla: "granitogres" },
  // 1. nadstropje (tloris list 6): vzhodni pas S→J: spalnica / kopalnica /
  // vetrolov (nova AB plošča, vstop ZV4) / soba; hodnik v L-obliki; dnevni Z+J
  { ime: "Spalnica", povrsina: "11,83 m²", etaza: "nadstropje", x1: -0.4, z1: -polS + 0.25, x2: polG - 0.3, z2: -3.4, tla: "granitogres" },
  { ime: "Kopalnica", povrsina: "5,04 m²", etaza: "nadstropje", x1: 1.35, z1: -3.4, x2: polG - 0.3, z2: -2.1, tla: "travertin" },
  { ime: "Vetrolov", povrsina: "3,76 m²", etaza: "nadstropje", x1: 2.45, z1: -2.1, x2: polG - 0.3, z2: -0.2, tla: "granitogres" },
  { ime: "Soba", povrsina: "14,56 m²", etaza: "nadstropje", x1: 0.8, z1: 0.28, x2: polG - 0.3, z2: polS - 0.25, tla: "granitogres" },
  { ime: "Hodnik", povrsina: "7,28 m²", etaza: "nadstropje", x1: -0.4, z1: -2.1, x2: 2.45, z2: 0.6, tla: "granitogres" },
  { ime: "Dnevni prostor s kuhinjo", povrsina: "32,12 m²", etaza: "nadstropje", x1: -polG + 0.3, z1: -polS + 0.25, x2: 0.8, z2: polS - 0.25, tla: "granitogres" },
  // podstreha (tloris list 7 + list 1): kopalnica 3,02 × 2,84
  { ime: "Predprostor", povrsina: "4,10 m²", etaza: "podstreha", x1: 2.4, z1: -2.28, x2: polG - 0.3, z2: -0.6, tla: "granitogres" },
  { ime: "Kopalnica", povrsina: "8,03 m²", etaza: "podstreha", x1: 1.4, z1: -polS + 0.25, x2: polG - 0.3, z2: -2.28, tla: "abacus" },
  { ime: "Spalnica", povrsina: "15,08 m²", etaza: "podstreha", x1: -polG + 0.3, z1: -polS + 0.25, x2: 1.4, z2: -1.9, tla: "granitogres" },
  { ime: "Soba", povrsina: "14,62 m²", etaza: "podstreha", x1: 1.0, z1: -0.6, x2: polG - 0.3, z2: polS - 0.25, tla: "granitogres" },
  { ime: "Dnevni prostor s kuhinjo", povrsina: "~32 m²", etaza: "podstreha", x1: -polG + 0.3, z1: -1.9, x2: 1.0, z2: polS - 0.25, tla: "granitogres" },
];

/** Notranja vrata (A: tipi V1–V4 iz shem; pozicije iz tlorisov). */
export type NotranjaVrata = {
  etaza: Etaza;
  tip: VrataTipId;
  x: number; z: number; // sredina prehoda
  smer: "x" | "z"; // os stene, v kateri je prehod
  opis: string;
};

export const VRATA_NOTRANJA: readonly NotranjaVrata[] = [
  // pritličje (kurilnica NIMA notranjih vrat — vstop od zunaj skozi ZV2)
  { etaza: "pritlicje", tip: "V1", x: 0.0, z: -2.9, smer: "x", opis: "vetrolov → predprostor" },
  { etaza: "pritlicje", tip: "V1", x: 1.9, z: -1.6, smer: "z", opis: "predprostor → kopalnica" },
  { etaza: "pritlicje", tip: "V1", x: -1.15, z: -1.9, smer: "z", opis: "predprostor → spalnica" },
  { etaza: "pritlicje", tip: "V2", x: -0.3, z: -0.95, smer: "x", opis: "predprostor → dnevni" },
  { etaza: "pritlicje", tip: "V1", x: 1.01, z: 1.95, smer: "z", opis: "dnevni → soba" },
  // nadstropje
  { etaza: "nadstropje", tip: "V3", x: 2.45, z: -1.15, smer: "z", opis: "vetrolov → hodnik (zastekljena)" },
  { etaza: "nadstropje", tip: "V1", x: 1.9, z: -2.1, smer: "x", opis: "hodnik → kopalnica" },
  { etaza: "nadstropje", tip: "V4", x: 0.9, z: -3.4, smer: "x", opis: "hodnik → spalnica" },
  { etaza: "nadstropje", tip: "V1", x: 1.6, z: 0.28, smer: "x", opis: "hodnik → soba" },
  { etaza: "nadstropje", tip: "V2", x: -0.4, z: -0.6, smer: "z", opis: "hodnik → dnevni" },
  // podstreha
  { etaza: "podstreha", tip: "V1", x: 2.9, z: -2.28, smer: "x", opis: "predprostor → kopalnica" },
  { etaza: "podstreha", tip: "V1", x: 2.4, z: -1.3, smer: "z", opis: "predprostor → dnevni/spalnica" },
  { etaza: "podstreha", tip: "V1", x: 1.4, z: -2.6, smer: "z", opis: "→ spalnica" },
  { etaza: "podstreha", tip: "V1", x: 1.0, z: 0.6, smer: "z", opis: "dnevni → soba" },
  { etaza: "podstreha", tip: "V1", x: 0.2, z: -1.9, smer: "x", opis: "dnevni → spalnica" },
];

/**
 * Okna in zunanja vrata PO PRENOVI (A: tipi iz shem; pozicije po fasadah
 * M 1:100 in tlorisih). stran: W=ulica, E=vrt/stopnišče, N/S=zatrepa.
 * ZV4 v vseh etažah v isti osi (»v osi vhodnih vrat v spodnjih etažah«).
 */
export type Odprtina = {
  id: string;
  tip: OknoTipId;
  stran: "W" | "E" | "N" | "S";
  etaza: Etaza;
  sredina: number; // koordinata vzdolž fasade (Z za W/E, X za N/S)
  parapet: number; // nad tlemi etaže
};

export const ODPRTINE: readonly Odprtina[] = [
  // ZAHOD — ulična fasada (fasada zahod)
  { id: "ZV3", tip: "ZV3", stran: "W", etaza: "pritlicje", sredina: -0.15, parapet: 0.1 },
  { id: "ZV4S", tip: "ZV4S", stran: "W", etaza: "pritlicje", sredina: 3.3, parapet: 0.0 },
  { id: "O4a", tip: "O4", stran: "W", etaza: "pritlicje", sredina: -3.9, parapet: 0.9 }, // spalnica
  { id: "O4b", tip: "O4", stran: "W", etaza: "pritlicje", sredina: -2.4, parapet: 0.9 }, // spalnica
  { id: "O5b", tip: "O5V", stran: "W", etaza: "nadstropje", sredina: -2.3, parapet: 0.0 }, // na balkon (S del)
  { id: "O4c", tip: "O4", stran: "W", etaza: "nadstropje", sredina: -0.9, parapet: 0.9 },
  { id: "O3a", tip: "O3", stran: "W", etaza: "nadstropje", sredina: 2.4, parapet: 0.9 }, // široko okno (J del)
  { id: "O6", tip: "O6", stran: "W", etaza: "podstreha", sredina: NACRT.frcada.sredinaZ, parapet: 0.9 }, // frčada
  // SEVER — zatrep: vhoda ZV1 (stanovanje) in ZV2 (kurilnica)
  { id: "ZV1", tip: "ZV1", stran: "N", etaza: "pritlicje", sredina: 0.3, parapet: 0.0 },
  { id: "ZV2", tip: "ZV2", stran: "N", etaza: "pritlicje", sredina: 3.6, parapet: 0.0 },
  { id: "O4d", tip: "O4", stran: "N", etaza: "nadstropje", sredina: 0.4, parapet: 0.9 },
  { id: "OMa", tip: "OM", stran: "N", etaza: "nadstropje", sredina: -2.2, parapet: 1.3 },
  { id: "OPa", tip: "OP", stran: "N", etaza: "podstreha", sredina: 0.5, parapet: 0.9 },
  // JUG — zatrep z balkončkoma
  { id: "O3b", tip: "O3", stran: "S", etaza: "pritlicje", sredina: -1.5, parapet: 0.9 }, // dnevni
  { id: "O3c", tip: "O3", stran: "S", etaza: "pritlicje", sredina: 1.0, parapet: 0.9 }, // dnevni (V del)
  { id: "O5c", tip: "O5V", stran: "S", etaza: "nadstropje", sredina: 1.0, parapet: 0.0 }, // balkonček
  { id: "O4e", tip: "O4", stran: "S", etaza: "nadstropje", sredina: -1.3, parapet: 0.9 },
  { id: "O5", tip: "O5", stran: "S", etaza: "podstreha", sredina: -0.9, parapet: 0.0 }, // balkon podstrehe
  // VZHOD — vrtna fasada + vhodi s stopnišča (ZV4 v isti osi −1,57)
  { id: "O1", tip: "O1", stran: "E", etaza: "pritlicje", sredina: -1.75, parapet: 1.7 }, // kopalnica
  { id: "O2", tip: "O2", stran: "E", etaza: "pritlicje", sredina: 0.4, parapet: 0.3 }, // fiksno, mahagoni
  { id: "ZV4a", tip: "ZV4", stran: "E", etaza: "nadstropje", sredina: -1.57, parapet: 0.0 },
  { id: "O3d", tip: "O3", stran: "E", etaza: "nadstropje", sredina: 1.9, parapet: 0.9 }, // soba
  { id: "ZV4b", tip: "ZV4", stran: "E", etaza: "podstreha", sredina: -1.57, parapet: 0.0 },
  { id: "O4f", tip: "O4", stran: "E", etaza: "podstreha", sredina: 0.3, parapet: 1.0 }, // soba
];
