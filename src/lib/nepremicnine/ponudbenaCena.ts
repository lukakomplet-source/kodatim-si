/**
 * PREVZETO iz Kompletko/EscortOps (escort-app/src/lib/offer-price.ts).
 * Formule so nespremenjene; izvirnik ostaja v svoji aplikaciji nedotaknjen.
 * Spremembe delaj TAM in prenesi sem, ne obratno.
 */
/**
 * What to offer for an apartment building, worked out the way it is done on the
 * back of a napkin.
 *
 * The idea is that a rented building is worth what it earns, not what the seller
 * says it is worth. You count what it brings in when it is normally full, take
 * off what it costs to run, and divide by the return the market expects. What
 * comes out is a price, and if the asking price is well above it, the answer is
 * not to stretch — it is that the building does not earn enough to be worth it.
 *
 *   units × rent × 12
 *   + other income        parking, storage, laundry — usually a few per cent
 *   × occupancy           nobody is full all year
 *   = actual income
 *   − expenses            everything except the loan
 *   = NOI
 *   ÷ cap rate            what the market pays for that income
 *   = price to offer
 *
 * Two things are deliberately left out, because they belong to the buyer rather
 * than the building: the loan and the tax. Financing is decided after the price.
 */

export type OfferInputs = {
  /** How many flats are being let */
  units: number;
  /** Market rent for one unit, per month */
  monthlyRentPerUnit: number;
  /** Parking, storage, laundry — as a percentage of the rent roll */
  otherIncomePct: number;
  /** Share of the year the flats are actually let */
  occupancyPct: number;
  /** Running costs as a percentage of the income that actually arrives */
  expensesPct: number;
  /** Running costs known in euros a year, on top of the percentage */
  expensesFixed: number;
  /** The return the market expects from this kind of building */
  capRatePct: number;
};

export type OfferBreakdown = {
  /** units × rent × 12 — everything, if it were full all year */
  grossRent: number;
  otherIncome: number;
  /** What actually arrives, once empty months are taken off */
  actualIncome: number;
  expenses: number;
  /** Actual income minus running costs — what the building earns */
  noi: number;
  /** NOI ÷ cap rate */
  offerPrice: number;
  /** What that price works out to per flat, which is how offers get compared */
  pricePerUnit: number | null;
  /** Set when the numbers cannot produce a price, and why */
  problem: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const ok = (n: number) => Number.isFinite(n);

export function computeOfferPrice(input: OfferInputs): OfferBreakdown {
  const empty: OfferBreakdown = {
    grossRent: 0, otherIncome: 0, actualIncome: 0, expenses: 0,
    noi: 0, offerPrice: 0, pricePerUnit: null, problem: null,
  };

  const { units, monthlyRentPerUnit, otherIncomePct, occupancyPct, expensesPct, expensesFixed, capRatePct } = input;
  if (![units, monthlyRentPerUnit, otherIncomePct, occupancyPct, expensesPct, expensesFixed, capRatePct].every(ok)) {
    return { ...empty, problem: "Vpiši številke." };
  }
  if (units <= 0 || monthlyRentPerUnit <= 0) {
    return { ...empty, problem: "Vpiši število enot in najemnino na enoto." };
  }

  const grossRent = r2(units * monthlyRentPerUnit * 12);
  const otherIncome = r2(grossRent * (otherIncomePct / 100));
  const actualIncome = r2((grossRent + otherIncome) * (occupancyPct / 100));
  const expenses = r2(actualIncome * (expensesPct / 100) + expensesFixed);
  const noi = r2(actualIncome - expenses);

  if (noi <= 0) {
    return {
      grossRent, otherIncome, actualIncome, expenses, noi,
      offerPrice: 0, pricePerUnit: null,
      problem: "Po stroških ne ostane nič — pri teh najemninah nepremičnina ne zasluži, zato ni cene, ki bi se izšla.",
    };
  }
  if (capRatePct <= 0) {
    return {
      grossRent, otherIncome, actualIncome, expenses, noi,
      offerPrice: 0, pricePerUnit: null,
      problem: "Vpiši zahtevani donos (cap rate) — brez njega cene ni mogoče izračunati.",
    };
  }

  const offerPrice = r2(noi / (capRatePct / 100));
  return {
    grossRent, otherIncome, actualIncome, expenses, noi,
    offerPrice,
    pricePerUnit: units > 0 ? r2(offerPrice / units) : null,
    problem: null,
  };
}

/**
 * The same sum read backwards: at a given asking price, what return does the
 * building actually give? Useful when the seller will not move — it says what
 * you would be buying rather than what you would like to pay.
 */
export function capRateAtPrice(noi: number, askingPrice: number): number | null {
  if (!ok(noi) || !ok(askingPrice) || askingPrice <= 0) return null;
  return r2((noi / askingPrice) * 100);
}
