/**
 * Specifikacija PO PZI NAČRTIH (Arhivitae 281/25) — kategorija A, razen kjer
 * je označeno B (inferirano) ali C (poenostavitev). Vir: docs/vojnik-nacrti/
 * ARHITEKTURA_PZI_ZDRUZENO.pdf + HOUSE_ANALYSIS.md.
 *
 * Svet: X+ = vzhod, Z+ = jug, Y+ = gor. Hiša centrirana na (0,0).
 * PZI tlorisi so risani z VZHODOM navzgor; tu je vse pretvorjeno v svet.
 */

export const NACRT = {
  // gabarit (A): ulična (zahodna) fasada teče S–J
  sirinaSJ: 10.75, // sever–jug (B: 3.02+5.05+2.83 − stik; tlorisi 10.60–10.90)
  globinaVZ: 9.3, // vzhod–zahod (A)
  // etaže (A, prereza A-A/B-B)
  pritlicjeTla: 0.0,
  pritlicjeStrop: 2.46,
  ploscaD: 0.25, // obstoječa monta plošča
  nadstropjeTla: 2.71,
  nadstropjeStrop: 5.21,
  podstrehaTla: 5.46,
  kolencna: 1.16, // kap na +6.62
  slemeY: 9.16, // podstreha +3.70 (A); sleme teče S–J
  // streha (A: Prefa-Prefalz; naklon izračunan iz prereza)
  previsKap: 0.45, // B
  previsCelo: 0.35, // B
  // balkon ob zahodni fasadi (obstoječi, ostane; A na fasadah)
  balkonGlobina: 1.35,
  balkonY: 2.71,
  // zunanje stopnišče — prizidava na VZHODNI fasadi (A)
  stopnisce: {
    dolzinaSJ: 5.05,
    globinaVZ: 2.88,
    odSevernegaRoba: 3.02, // A (tloris pritličja)
    visinaStolpa: 7.2, // A (prerezi stopnišča)
    podestSirina: 1.15,
  },
  // frčada na ZAHODNI strešini (A: O6 134/300, štirikrilno)
  frcada: {
    sredinaZ: -0.2, // B: nad dnevnim prostorom podstrehe
    sirina: 3.3, // okno 3.00 + špalete (B)
    oknoW: 3.0,
    oknoH: 1.34,
    parapet: 0.9, // B
    celoX: -4.0, // B: čelo ~0.65 m za ravnino fasade
    strehaDo: -1.1, // B: enokapnica frčade se priključi na strešino
  },
} as const;

export type Etaza = "pritlicje" | "nadstropje" | "podstreha";

/** Sobe: pravokotniki v svetu (B — digitalizirano iz tlorisov M 1:50, ±10 cm). */
export type Soba = {
  ime: string;
  povrsina: string; // iz načrta (A)
  etaza: Etaza;
  x1: number; z1: number; x2: number; z2: number;
  tla: "granitogres" | "travertin" | "abacus";
};

const polS = NACRT.sirinaSJ / 2; // 5.375
const polG = NACRT.globinaVZ / 2; // 4.65

/**
 * PRITLIČJE (sever = −Z, vzhod = +X). Nosilni raster (A, tloris):
 * S pas: kurilnica(SV), kopalnica, kuhinja/PS, soba(JV zgoraj vzhodno) …
 * Zahodni pas: vetrolov (S), spalnica (S–sredina), dnevni (J).
 */
export const SOBE: readonly Soba[] = [
  // pritličje
  { ime: "Kurilnica", povrsina: "5,66 m²", etaza: "pritlicje", x1: 1.9, z1: -polS + 0.3, x2: polG - 0.3, z2: -2.5, tla: "granitogres" },
  { ime: "Kopalnica", povrsina: "4,61 m²", etaza: "pritlicje", x1: 1.9, z1: -2.5, x2: polG - 0.3, z2: -0.6, tla: "travertin" },
  { ime: "Kuhinja (dnevni)", povrsina: "del 30,72 m²", etaza: "pritlicje", x1: 1.9, z1: -0.6, x2: polG - 0.3, z2: 1.3, tla: "granitogres" },
  { ime: "Soba", povrsina: "10,69 m²", etaza: "pritlicje", x1: 1.0, z1: 1.3, x2: polG - 0.3, z2: 4.4, tla: "granitogres" },
  { ime: "Vetrolov", povrsina: "5,92 m²", etaza: "pritlicje", x1: -1.3, z1: -polS + 0.3, x2: 1.9, z2: -2.9, tla: "granitogres" },
  { ime: "Predprostor", povrsina: "2,95 m²", etaza: "pritlicje", x1: -1.3, z1: -2.9, x2: 0.6, z2: -0.9, tla: "granitogres" },
  { ime: "Spalnica", povrsina: "14,40 m²", etaza: "pritlicje", x1: -polG + 0.3, z1: -polS + 0.3, x2: -1.3, z2: -0.9, tla: "granitogres" },
  { ime: "Dnevni prostor", povrsina: "30,72 m²", etaza: "pritlicje", x1: -polG + 0.3, z1: -0.9, x2: 1.9, z2: polS - 0.3, tla: "granitogres" },
  // 1. nadstropje
  { ime: "Vetrolov", povrsina: "3,76 m²", etaza: "nadstropje", x1: 2.6, z1: -2.4, x2: polG - 0.3, z2: -0.8, tla: "granitogres" },
  { ime: "Kopalnica", povrsina: "5,04 m²", etaza: "nadstropje", x1: 1.4, z1: -2.4, x2: 2.6, z2: -0.2, tla: "travertin" },
  { ime: "Spalnica", povrsina: "11,83 m²", etaza: "nadstropje", x1: 0.8, z1: -polS + 0.3, x2: polG - 0.3, z2: -2.4, tla: "granitogres" },
  { ime: "Soba", povrsina: "14,56 m²", etaza: "nadstropje", x1: 0.8, z1: -0.2, x2: polG - 0.3, z2: polS - 0.3, tla: "granitogres" },
  { ime: "Hodnik", povrsina: "7,28 m²", etaza: "nadstropje", x1: -0.4, z1: -2.4, x2: 1.4, z2: 0.6, tla: "granitogres" },
  { ime: "Dnevni prostor s kuhinjo", povrsina: "32,12 m²", etaza: "nadstropje", x1: -polG + 0.3, z1: -polS + 0.3, x2: 0.8, z2: polS - 0.3, tla: "granitogres" },
  // podstreha
  { ime: "Predprostor", povrsina: "4,10 m²", etaza: "podstreha", x1: 2.4, z1: -2.2, x2: polG - 0.3, z2: -0.6, tla: "granitogres" },
  { ime: "Kopalnica", povrsina: "8,03 m²", etaza: "podstreha", x1: 1.4, z1: -polS + 0.3, x2: polG - 0.3, z2: -2.2, tla: "abacus" },
  { ime: "Spalnica", povrsina: "15,08 m²", etaza: "podstreha", x1: -polG + 0.3, z1: -polS + 0.3, x2: 1.4, z2: -1.9, tla: "granitogres" },
  { ime: "Soba", povrsina: "14,62 m²", etaza: "podstreha", x1: 1.0, z1: -0.6, x2: polG - 0.3, z2: polS - 0.3, tla: "granitogres" },
  { ime: "Dnevni prostor s kuhinjo", povrsina: "~32 m²", etaza: "podstreha", x1: -polG + 0.3, z1: -1.9, x2: 1.0, z2: polS - 0.3, tla: "granitogres" },
];

/** Notranja vrata (A: sheme V1–V4) — prehodi med prostori, krilo priprto. */
export type NotranjaVrata = {
  etaza: Etaza;
  x: number; z: number; // sredina prehoda
  smer: "x" | "z"; // os stene, v kateri je prehod
  sirina: number;
};

export const VRATA_NOTRANJA: readonly NotranjaVrata[] = [
  // pritličje (V1 84/210, V2 95/210 …)
  { etaza: "pritlicje", x: 1.9, z: -1.6, smer: "z", sirina: 0.84 }, // predpr.→kopalnica
  { etaza: "pritlicje", x: 1.9, z: 0.4, smer: "z", sirina: 0.95 }, // →kuhinja/dnevni V2
  { etaza: "pritlicje", x: 1.45, z: 1.3, smer: "x", sirina: 0.84 }, // dnevni→soba
  { etaza: "pritlicje", x: -1.3, z: -1.9, smer: "z", sirina: 0.84 }, // predpr.→spalnica
  { etaza: "pritlicje", x: -0.35, z: -0.9, smer: "x", sirina: 0.95 }, // predpr.→dnevni
  { etaza: "pritlicje", x: 0.6, z: -2.9, smer: "x", sirina: 0.84 }, // vetrolov→predpr.
  { etaza: "pritlicje", x: 2.7, z: -2.5, smer: "x", sirina: 0.84 }, // kopal.→kurilnica
  // nadstropje
  { etaza: "nadstropje", x: 2.6, z: -1.5, smer: "z", sirina: 0.84 }, // vetrolov→kopal.
  { etaza: "nadstropje", x: 1.7, z: -2.4, smer: "x", sirina: 0.84 }, // vetrolov→spalnica? (B)
  { etaza: "nadstropje", x: 1.4, z: -1.2, smer: "z", sirina: 0.84 }, // kopal.→hodnik
  { etaza: "nadstropje", x: 1.9, z: -0.2, smer: "x", sirina: 0.84 }, // hodnik→soba
  { etaza: "nadstropje", x: 0.8, z: -1.4, smer: "z", sirina: 0.75 }, // hodnik→spal. V4
  { etaza: "nadstropje", x: -0.4, z: -0.6, smer: "z", sirina: 0.95 }, // hodnik→dnevni
  // podstreha
  { etaza: "podstreha", x: 2.4, z: -1.4, smer: "z", sirina: 0.84 }, // predpr.→kopal.? (B)
  { etaza: "podstreha", x: 3.0, z: -0.6, smer: "x", sirina: 0.84 }, // predpr.→soba
  { etaza: "podstreha", x: 1.4, z: -2.6, smer: "z", sirina: 0.84 }, // →spalnica
  { etaza: "podstreha", x: 1.0, z: 0.6, smer: "z", sirina: 0.84 }, // dnevni→soba
  { etaza: "podstreha", x: 0.2, z: -1.9, smer: "x", sirina: 0.95 }, // dnevni→spalnica (B)
];

/**
 * Okna in zunanja vrata PO PRENOVI (A: sheme O1–O6, ZV1–ZV4; pozicije B po
 * fasadah M 1:100). stran: W=ulica, E=vrt/stopnišče, N/S=zatrepa.
 */
export type Odprtina = {
  id: string;
  stran: "W" | "E" | "N" | "S";
  etaza: Etaza;
  sredina: number; // koordinata vzdolž fasade (Z za W/E, X za N/S)
  w: number;
  h: number;
  parapet: number; // nad tlemi etaže
  vrsta: "okno" | "vrata" | "balkonska";
};

export const ODPRTINE: readonly Odprtina[] = [
  // ZAHOD — ulična fasada
  { id: "ZV3", stran: "W", etaza: "pritlicje", sredina: -0.2, w: 1.0, h: 2.0, parapet: 0.1, vrsta: "okno" }, // novo okno v vratni odprtini
  { id: "ZV4", stran: "W", etaza: "pritlicje", sredina: 3.2, w: 2.2, h: 2.1, parapet: 0.0, vrsta: "vrata" }, // okno+vrata v dnevni
  { id: "O3", stran: "W", etaza: "pritlicje", sredina: -3.4, w: 1.3, h: 1.2, parapet: 0.9, vrsta: "okno" }, // spalnica (B)
  { id: "O5b", stran: "W", etaza: "nadstropje", sredina: 2.3, w: 0.95, h: 2.15, parapet: 0.0, vrsta: "balkonska" }, // na balkon (B)
  { id: "O4a", stran: "W", etaza: "nadstropje", sredina: -0.6, w: 1.18, h: 1.18, parapet: 0.9, vrsta: "okno" },
  { id: "O4b", stran: "W", etaza: "nadstropje", sredina: -3.2, w: 1.18, h: 1.18, parapet: 0.9, vrsta: "okno" },
  { id: "O6", stran: "W", etaza: "podstreha", sredina: NACRT.frcada.sredinaZ, w: 3.0, h: 1.34, parapet: 0.9, vrsta: "okno" }, // frčada
  // SEVER — zatrep z vhodom v pritličje
  { id: "ZV1", stran: "N", etaza: "pritlicje", sredina: 0.2, w: 1.4, h: 2.1, parapet: 0.0, vrsta: "vrata" }, // 100+40/210
  { id: "O4c", stran: "N", etaza: "nadstropje", sredina: 1.6, w: 1.18, h: 1.18, parapet: 0.9, vrsta: "okno" },
  { id: "O1", stran: "N", etaza: "podstreha", sredina: 0.0, w: 0.6, h: 0.4, parapet: 1.3, vrsta: "okno" },
  // JUG — zatrep z balkončkoma
  { id: "O3b", stran: "S", etaza: "pritlicje", sredina: 1.2, w: 1.3, h: 1.2, parapet: 0.9, vrsta: "okno" },
  { id: "O5c", stran: "S", etaza: "nadstropje", sredina: -0.5, w: 0.95, h: 2.15, parapet: 0.0, vrsta: "balkonska" },
  { id: "O5", stran: "S", etaza: "podstreha", sredina: 0.3, w: 2.3, h: 2.15, parapet: 0.0, vrsta: "balkonska" }, // 95/245+135
  // VZHOD — vrtna fasada + vhodi s stopnišča
  { id: "ZV2", stran: "E", etaza: "pritlicje", sredina: -1.8, w: 0.8, h: 2.1, parapet: 0.0, vrsta: "vrata" },
  { id: "ZV4a", stran: "E", etaza: "nadstropje", sredina: -1.6, w: 1.0, h: 2.1, parapet: 0.0, vrsta: "vrata" },
  { id: "ZV4b", stran: "E", etaza: "podstreha", sredina: -1.4, w: 1.0, h: 2.1, parapet: 0.0, vrsta: "vrata" },
  { id: "O2", stran: "E", etaza: "pritlicje", sredina: 0.9, w: 1.0, h: 2.0, parapet: 0.3, vrsta: "okno" }, // fiksno, mahagoni
  { id: "O3c", stran: "E", etaza: "nadstropje", sredina: 1.9, w: 1.3, h: 1.2, parapet: 0.9, vrsta: "okno" },
];
