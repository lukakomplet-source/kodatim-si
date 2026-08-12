/**
 * How comparable two cars actually are, as a number.
 *
 * The scoring is deliberately made of parts rather than one opaque figure, so
 * the screen can say WHY a car was used as a comparable ("same engine and
 * gearbox, one year newer, 10,000 km less") instead of asking the user to trust
 * a percentage.
 *
 * Two decisions worth stating, because both are easy to get wrong:
 *
 *   Unknown is not a mismatch. A field the source never published scores as
 *   neutral. Treating it as a mismatch would systematically punish older
 *   adverts, which publish less — and those are exactly the finished ones the
 *   history depends on.
 *
 *   Price is not an input. The whole question is what this car is worth, so
 *   scoring on price similarity would make the answer circular: it would find
 *   cars that cost what we already assumed and then report that as the value.
 */

import { DRAGE_ZNACILKE, kljuc, type Vozilo } from "./vozilo";

export type Utezi = {
  konfiguracija: number;
  motor: number;
  letnik: number;
  kilometri: number;
  oprema: number;
  karoserija: number;
};

/**
 * Defaults. Configuration (brand/model/trim/gearbox/drivetrain) dominates
 * because two cars that differ there are not the same product at all, whatever
 * else matches.
 */
export const PRIVZETE_UTEZI: Utezi = {
  konfiguracija: 34,
  motor: 24,
  letnik: 14,
  kilometri: 9,
  oprema: 15,
  karoserija: 4,
};

export type Sestavine = {
  konfiguracija: number;
  motor: number;
  letnik: number;
  kilometri: number;
  oprema: number;
  karoserija: number;
};

export type Ocena = {
  /** 0..100 */
  skupno: number;
  sestavine: Sestavine;
  /** Slovenian, one line, for the "why is this comparable" popover. */
  razlaga: string;
};

/** Neutral score for "the source did not say", so absence cannot be punished. */
const NEZNANO = 70;

/** 100 when equal, falling to 0 at `polna` units of difference. */
function blizina(a: number | null, b: number | null, polna: number): number {
  if (a === null || b === null) return NEZNANO;
  const razlika = Math.abs(a - b);
  return Math.max(0, Math.round(100 * (1 - razlika / polna)));
}

/** Relative closeness, for quantities where a percentage matters more than a unit. */
function relativnaBlizina(a: number | null, b: number | null, polnaDelez: number): number {
  if (a === null || b === null) return NEZNANO;
  const osnova = Math.max(Math.abs(a), Math.abs(b), 1);
  const razlika = Math.abs(a - b) / osnova;
  return Math.max(0, Math.round(100 * (1 - razlika / polnaDelez)));
}

function enako(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return kljuc(a) === kljuc(b) ? 100 : 0;
}

/**
 * Trim similarity as the overlap coefficient — shared words over the SHORTER
 * descriptor. "50 TDI quattro" against "50 TDI quattro S-line" shares
 * everything that identifies the engine and scores 100. Crucially, a short
 * descriptor recovered from a listing URL ("vz 4drive") found whole inside a
 * long noisy title ("VZ 4Drive 2.0 TSI SLO FI NAVI GRETJE VOLANA") also scores
 * as a full trim match, instead of being diluted to a third by the title's
 * marketing words — which is exactly the case that was ranking the right VZ
 * below cheap 1.5 petrols.
 */
function podobnostVerzije(a: string | null, b: string | null): number {
  const ka = kljuc(a).split(" ").filter((w) => w.length > 1);
  const kb = kljuc(b).split(" ").filter((w) => w.length > 1);
  if (ka.length === 0 || kb.length === 0) return NEZNANO;
  const sa = new Set(ka);
  const sb = new Set(kb);
  let skupnih = 0;
  for (const w of sa) if (sb.has(w)) skupnih++;
  return Math.round((100 * skupnih) / Math.min(sa.size, sb.size));
}

/**
 * Equipment overlap, weighted so that the features people actually pay for
 * count more. Jaccard on the raw sets would let a dozen shared airbags drown
 * out a missing panoramic roof.
 */
export function podobnostOpreme(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return NEZNANO;
  if (a.length === 0 || b.length === 0) return NEZNANO;

  const sa = new Set(a);
  const sb = new Set(b);
  const teza = (s: string) => (DRAGE_ZNACILKE.has(s) ? 3 : 1);

  let skupna = 0;
  let unija = 0;
  for (const s of new Set([...sa, ...sb])) {
    const t = teza(s);
    unija += t;
    if (sa.has(s) && sb.has(s)) skupna += t;
  }
  return unija === 0 ? NEZNANO : Math.round((100 * skupna) / unija);
}

export function oceniPodobnost(cilj: Vozilo, kandidat: Vozilo, utezi: Utezi = PRIVZETE_UTEZI): Ocena {
  // Configuration: model identity, gearbox and drivetrain, plus how much of the
  // trim designation is shared.
  const model = enako(cilj.model, kandidat.model);
  const menjalnik = enako(cilj.menjalnik, kandidat.menjalnik);
  const pogon = enako(cilj.pogon, kandidat.pogon);
  const verzija = podobnostVerzije(cilj.verzija, kandidat.verzija);
  // Model identity and trim/engine designation carry configuration together;
  // gearbox and drivetrain refine it. Trim is weighted alongside model on
  // purpose: the same model in a different performance version (VZ vs 1.5, RS
  // vs base) is not the same product, and equal-weighting it with gearbox let
  // that difference wash out.
  const konfiguracija = Math.round(
    (model ?? NEZNANO) * 0.35 + verzija * 0.35 + (menjalnik ?? NEZNANO) * 0.15 + (pogon ?? NEZNANO) * 0.15
  );

  // Engine: power carries most of it, displacement confirms it, fuel is a gate.
  const gorivo = enako(cilj.gorivo, kandidat.gorivo);
  const moc = relativnaBlizina(cilj.kw, kandidat.kw, 0.35);
  const prostornina = relativnaBlizina(cilj.ccm, kandidat.ccm, 0.4);
  const motor = Math.round((gorivo ?? NEZNANO) * 0.4 + moc * 0.4 + prostornina * 0.2);

  // Four model years apart is a different car; that is the zero point.
  const letnik = blizina(cilj.letnik, kandidat.letnik, 4);

  // Mileage matters as a proportion, not as an absolute: 10,000 km apart is
  // nothing on a 150,000 km car and a lot on a 20,000 km one.
  const kilometri = relativnaBlizina(cilj.km, kandidat.km, 0.5);

  const oprema = podobnostOpreme(cilj.znacilke, kandidat.znacilke);
  const karoserija = enako(cilj.karoserija, kandidat.karoserija) ?? NEZNANO;

  const sestavine: Sestavine = { konfiguracija, motor, letnik, kilometri, oprema, karoserija };

  const skupnaTeza =
    utezi.konfiguracija + utezi.motor + utezi.letnik + utezi.kilometri + utezi.oprema + utezi.karoserija;
  const skupno = Math.round(
    (konfiguracija * utezi.konfiguracija +
      motor * utezi.motor +
      letnik * utezi.letnik +
      kilometri * utezi.kilometri +
      oprema * utezi.oprema +
      karoserija * utezi.karoserija) /
      skupnaTeza
  );

  return { skupno, sestavine, razlaga: sestaviRazlago(cilj, kandidat, sestavine) };
}

/**
 * Slovenian has four plural forms and the text is read by customers, so "7
 * letoi starejši" is not a typo to shrug at — 1 leto, 2 leti, 3–4 leta, 5+ let.
 */
function leta(n: number): string {
  const zadnji = n % 10;
  const zadnja2 = n % 100;
  if (zadnja2 >= 11 && zadnja2 <= 14) return `${n} let`;
  if (zadnji === 1) return `${n} leto`;
  if (zadnji === 2) return `${n} leti`;
  if (zadnji === 3 || zadnji === 4) return `${n} leta`;
  return `${n} let`;
}

function sestaviRazlago(cilj: Vozilo, kandidat: Vozilo, s: Sestavine): string {
  const deli: string[] = [];

  if (cilj.gorivo && kandidat.gorivo && cilj.gorivo === kandidat.gorivo) deli.push("isto gorivo");
  if (cilj.menjalnik && kandidat.menjalnik && cilj.menjalnik === kandidat.menjalnik) {
    deli.push("isti menjalnik");
  }
  if (cilj.pogon && kandidat.pogon && cilj.pogon === kandidat.pogon) deli.push("isti pogon");

  if (cilj.letnik !== null && kandidat.letnik !== null) {
    const d = kandidat.letnik - cilj.letnik;
    if (d === 0) deli.push("isti letnik");
    else deli.push(`${leta(Math.abs(d))} ${d > 0 ? "novejši" : "starejši"}`);
  }

  if (cilj.km !== null && kandidat.km !== null) {
    const d = kandidat.km - cilj.km;
    if (Math.abs(d) < 5000) deli.push("podobna kilometrina");
    else {
      deli.push(`${Math.abs(Math.round(d / 1000))}.000 km ${d > 0 ? "več" : "manj"}`);
    }
  }

  if (cilj.kw !== null && kandidat.kw !== null && cilj.kw !== kandidat.kw) {
    deli.push(`${kandidat.kw} kW namesto ${cilj.kw} kW`);
  }

  if (s.oprema >= 80) deli.push("zelo podobna oprema");
  else if (s.oprema <= 40) deli.push("opazno drugačna oprema");

  return deli.length > 0 ? deli.join(", ") : "primerljiva konfiguracija";
}
