import { razdaljaKm } from "./kraji";
import { M2_NA_ENOTO_OCENA } from "./cilj";
import { povrsinaZaIzracun } from "./verjetnost";

/**
 * TURISTIČNI POTENCIAL — ali se iz te hiše da narediti booking.
 *
 * Vprašanje ima tri dele in nobeden sam ne zadošča:
 *
 *   1. JE BLIZU ČESA?  Hiša štiri kilometre od Bleda je nekaj drugega kot
 *      enaka hiša štirideset kilometrov stran. Meri se razdalja do najbližje
 *      atrakcije iz `nep_atrakcije`.
 *   2. ALI TJA KDO HODI SPAT?  Lepo jezero, kamor pride tisoč ljudi na leto,
 *      ni trg. To pove SURS: prenočitve v občini (tabela 2164525S). Brez te
 *      številke bi vsak grič ob vodi izgledal kot Bled.
 *   3. SE DA RAZDELITI NA ENOTE?  Ena soba ni booking. Zmožnost enot se oceni
 *      iz površine po istem konservativnem pravilu kot pri investicijskem
 *      cilju (30 m² na enoto), ali pa iz potrjenega števila enot v oglasu.
 *
 * Kar ta izračun NAMENOMA NE POVE: ali je kratkoročno oddajanje na tem objektu
 * sploh dovoljeno. Pri etažni lastnini je potrebno soglasje solastnikov,
 * občine imajo svoje odloke, objekt mora biti kategoriziran. Tega ni v nobeni
 * bazi, ki jo imamo, zato je na kartici opozorilo in ne točka v izračunu —
 * številka, ki bi to skrila, bi bila nevarnejša od nobene številke.
 */

export type Atrakcija = {
  ime: string;
  tip: string;
  lat: number;
  lng: number;
  /** 3 = svetovno znano, 2 = državno, 1 = regionalno. */
  moc: number;
};

export type TurizemObcina = {
  obcina: string;
  prenocitve: number | null;
  lat: number | null;
  lng: number | null;
};

export type OcenaTurizma = {
  /** Najbližja atrakcija in razdalja do nje. */
  atrakcija: { ime: string; tip: string; km: number; moc: number } | null;
  /** Občina, katere sedež je najbližji, in njene prenočitve. */
  obcina: { ime: string; prenocitve: number } | null;
  /** Koliko enot bi iz tega šlo narediti (potrjeno ali ocena iz m²). */
  enot: number | null;
  enotVir: "potrjeno" | "ocena" | null;
  /** 0–100. */
  tocke: number;
  /** Stavki, ki povedo, iz česa je ocena nastala. */
  razlaga: string[];
};

const TIP_OZNAKA: Record<string, string> = {
  jezero: "jezero",
  smucisce: "smučišče",
  terme: "terme",
  obala: "obala",
  jama: "jama",
  gore: "gore",
  mesto: "mesto",
  vino: "vinorodno območje",
};

/**
 * Točke za bližino. Lestvica ni linearna, ker turizem ni: pet kilometrov od
 * Bleda je še vedno "pri Bledu", petindvajset pa ni. Moč atrakcije razteg
 * lestvice — do svetovno znane se ljudje peljejo dlje.
 */
function tockeBlizine(km: number, moc: number): number {
  const razteg = 0.7 + moc * 0.3; // moč 1 → ×1,0; moč 3 → ×1,6
  const d = km / razteg;
  if (d <= 3) return 40;
  if (d <= 6) return 34;
  if (d <= 10) return 26;
  if (d <= 15) return 17;
  if (d <= 25) return 9;
  return 0;
}

/**
 * Točke za obisk. Meja je postavljena po dejanskih podatkih 2025: Ljubljana
 * 2,8 mio prenočitev, Piran 1,9, Bled 1,2, Bohinj 0,87, Bovec 0,62 — pod
 * 20.000 pa je občina turistično tiha, kakor koli lepa je.
 */
function tockePrenocitev(prenocitve: number): number {
  if (prenocitve >= 500_000) return 35;
  if (prenocitve >= 200_000) return 30;
  if (prenocitve >= 80_000) return 24;
  if (prenocitve >= 30_000) return 16;
  if (prenocitve >= 10_000) return 8;
  return 0;
}

/** Točke za zmožnost delitve: ena enota ni booking, štiri so posel. */
function tockeEnot(enot: number): number {
  if (enot >= 6) return 25;
  if (enot >= 4) return 21;
  if (enot >= 3) return 16;
  if (enot >= 2) return 10;
  return 3;
}

export function oceniTurizem(
  v: {
    lat: number | null;
    lng: number | null;
    tip: string | null;
    povrsina_m2: number | null;
    st_enot: number | null;
    st_enot_ocena: number | null;
  },
  atrakcije: Atrakcija[],
  obcine: TurizemObcina[]
): OcenaTurizma | null {
  // Brez koordinat ni ne razdalje ne občine — in ocena brez obojega bi bila
  // samo preimenovana kvadratura.
  if (v.lat === null || v.lng === null) return null;

  let najblizja: { a: Atrakcija; km: number } | null = null;
  for (const a of atrakcije) {
    const km = razdaljaKm(v.lat, v.lng, a.lat, a.lng);
    // Ne najbližja po kilometrih, ampak najbližja PO TOČKAH — Bled dvajset
    // kilometrov stran je za goste več vreden kot regionalna terma pet.
    if (!najblizja || tockeBlizine(km, a.moc) > tockeBlizine(najblizja.km, najblizja.a.moc)) {
      najblizja = { a, km };
    }
  }

  /**
   * Najbližja občina — a samo, če je res blizu.
   *
   * V bazi so tudi hrvaški oglasi (šifrant krajev pokriva SI in HR). Brez meje
   * je "Zadarska, Starigrad" dobil občino Sveta Ana 55 km stran in z njo njeno
   * turistično statistiko — številka bi bila videti verodostojna in bila
   * popolnoma napačna. Sedeži slovenskih občin so gosto posejani; karkoli je
   * dlje kot 25 km od najbližjega, ni v Sloveniji ali pa ni določljivo.
   */
  const NAJVEC_KM_DO_OBCINE = 25;
  let najblizjaObcina: { o: TurizemObcina; km: number } | null = null;
  for (const o of obcine) {
    if (o.lat === null || o.lng === null) continue;
    const km = razdaljaKm(v.lat, v.lng, o.lat, o.lng);
    if (!najblizjaObcina || km < najblizjaObcina.km) najblizjaObcina = { o, km };
  }
  if (najblizjaObcina && najblizjaObcina.km > NAJVEC_KM_DO_OBCINE) najblizjaObcina = null;

  const povrsina = povrsinaZaIzracun(v.tip, v.povrsina_m2);
  const potrjeno = v.st_enot !== null && v.st_enot > 0 ? v.st_enot : null;
  const izOcene = v.st_enot_ocena !== null && v.st_enot_ocena > 0 ? v.st_enot_ocena : null;
  const izPovrsine = povrsina !== null && povrsina > 0 ? Math.floor(povrsina / M2_NA_ENOTO_OCENA) : null;
  const enot = potrjeno ?? izOcene ?? izPovrsine;
  const enotVir: OcenaTurizma["enotVir"] = potrjeno !== null ? "potrjeno" : enot !== null ? "ocena" : null;

  const prenocitve = najblizjaObcina?.o.prenocitve ?? null;
  const tocke =
    (najblizja ? tockeBlizine(najblizja.km, najblizja.a.moc) : 0) +
    (prenocitve !== null ? tockePrenocitev(prenocitve) : 0) +
    (enot !== null ? tockeEnot(enot) : 0);

  const razlaga: string[] = [];
  if (najblizja) {
    razlaga.push(
      `${najblizja.a.ime} (${TIP_OZNAKA[najblizja.a.tip] ?? najblizja.a.tip}) je ${najblizja.km.toFixed(1)} km stran.`
    );
  } else {
    razlaga.push("V dosegu ni nobene atrakcije s seznama.");
  }
  if (najblizjaObcina && prenocitve !== null) {
    razlaga.push(
      `Občina ${najblizjaObcina.o.obcina} je imela ${prenocitve.toLocaleString("sl-SI")} prenočitev (SURS, zadnje leto).`
    );
  } else {
    razlaga.push("Podatka o prenočitvah ni — nepremičnina je zunaj dosega slovenske občinske statistike.");
  }
  if (enot !== null) {
    razlaga.push(
      enotVir === "potrjeno"
        ? `${enot} enot je potrjenih v oglasu.`
        : `~${enot} enot — ocena${povrsina !== null ? ` iz ${Math.round(povrsina)} m² pri ${M2_NA_ENOTO_OCENA} m²/enoto` : ""}, ne podatek.`
    );
  } else {
    razlaga.push("Zmožnosti delitve na enote ni mogoče oceniti (ni površine).");
  }

  return {
    atrakcija: najblizja ? { ime: najblizja.a.ime, tip: najblizja.a.tip, km: Math.round(najblizja.km * 10) / 10, moc: najblizja.a.moc } : null,
    obcina: najblizjaObcina && prenocitve !== null ? { ime: najblizjaObcina.o.obcina, prenocitve } : null,
    enot,
    enotVir,
    tocke: Math.min(100, tocke),
    razlaga,
  };
}
