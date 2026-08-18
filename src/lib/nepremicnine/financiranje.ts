/**
 * PREVZETO iz Kompletko/EscortOps (escort-app/src/lib/financing.ts).
 * Formule so nespremenjene; izvirnik ostaja v svoji aplikaciji nedotaknjen.
 * Spremembe delaj TAM in prenesi sem, ne obratno.
 */
/**
 * The loan half of the offer: how much of the price has to be your own money,
 * and what is left over once the bank is paid.
 *
 * The price calculation deliberately ignores financing — a building earns what
 * it earns regardless of who lends against it. But the price is only half the
 * question. What decides whether a deal is doable is how much cash has to go
 * in, and whether the rent still covers the instalment afterwards.
 *
 * How much own money is not a matter of taste in Slovenia. Banka Slovenije
 * recommends that the loan does not exceed 80 % of the value of a home you
 * will actually live in, and 70 % of a residential property you are buying to
 * let — a bank may go past it, but has to document and justify why. So 20 %
 * down for your own home, 30 % for an investment. Commercial and industrial
 * property is outside that recommendation entirely; there the number comes
 * from bank practice, and it is higher.
 *
 * There is no location tier in any of this: the rules are the same in
 * Ljubljana and in Prekmurje. What changes with location is the valuation the
 * bank puts on the property, and how readily it lends at all — which shows up
 * as a haircut on the appraisal, not as a different percentage.
 *
 * Sources (checked August 2026):
 *   Banka Slovenije, macroprudential restrictions on household lending
 *   https://www.bsi.si/sl/financna-stabilnost/makrobonitetni-instrumenti/makrobonitetne-omejitve-kreditiranja-prebivalstva-veljavno-od-1-julija-2023-dalje
 *   Forbes Slovenija — what the individual banks actually ask for
 *   https://forbes.n1info.si/nepremicnine/obrestne-mere-padajo-koliko-prihrankov-pri-nakupu-stanovanja-zahtevajo-banke/
 */

export type PropertyKind =
  | "primarno"
  | "najem"
  | "vecstanovanjska"
  | "poslovna"
  | "industrijska"
  | "zemljisce";

export interface PropertyRule {
  kind: PropertyKind;
  label: string;
  /** Lowest own-funds share that is realistic, in per cent of the price */
  minDownPct: number;
  /** What banks usually end up asking for */
  typicalDownPct: number;
  /** Whether the figure comes from a Banka Slovenije recommendation or from practice */
  binding: "priporočilo" | "praksa";
  /** One line the user can read without leaving the calculator */
  note: string;
}

export const PROPERTY_RULES: PropertyRule[] = [
  {
    kind: "primarno",
    label: "Stanovanje ali hiša zase (stalno bivališče)",
    minDownPct: 20,
    typicalDownPct: 20,
    binding: "priporočilo",
    note: "Banka Slovenije priporoča kredit do 80 % vrednosti, torej 20 % svojega. Nekatere banke (DBS, Sparkasse) gredo ob dobrem zavarovanju tudi nižje.",
  },
  {
    kind: "najem",
    label: "Stanovanje ali hiša za oddajanje",
    minDownPct: 30,
    typicalDownPct: 30,
    binding: "priporočilo",
    note: "Ker ne gre za tvoje stalno bivališče, je priporočilo strožje — kredit do 70 % vrednosti, torej 30 % svojega.",
  },
  {
    kind: "vecstanovanjska",
    label: "Večstanovanjska stavba (več enot za oddajanje)",
    minDownPct: 30,
    typicalDownPct: 35,
    binding: "praksa",
    note: "Isto priporočilo kot za naložbeno stanovanje, a banke pri celi stavbi pogosto zahtevajo več in gledajo predvsem, ali najemnine pokrijejo obrok.",
  },
  {
    kind: "poslovna",
    label: "Poslovni prostor, pisarna, trgovina",
    minDownPct: 30,
    typicalDownPct: 35,
    binding: "praksa",
    note: "Zunaj makrobonitetnega priporočila — pogoji so stvar dogovora. V praksi banke zahtevajo 30–40 % lastnih sredstev in da najemnine krijejo obrok z rezervo.",
  },
  {
    kind: "industrijska",
    label: "Skladišče ali proizvodni objekt",
    minDownPct: 35,
    typicalDownPct: 40,
    binding: "praksa",
    note: "Težje unovčljiva nepremičnina, zato banke zahtevajo največ lastnih sredstev — praviloma 35–40 %.",
  },
  {
    kind: "zemljisce",
    label: "Zemljišče",
    minDownPct: 50,
    typicalDownPct: 50,
    binding: "praksa",
    note: "Zemljišče samo po sebi ne prinaša dohodka, zato ga banke financirajo najslabše — pogosto le do polovice vrednosti, če sploh.",
  },
];

export function ruleFor(kind: PropertyKind): PropertyRule {
  return PROPERTY_RULES.find((r) => r.kind === kind) ?? PROPERTY_RULES[0]!;
}

/** What banks want the rent to cover the instalment by, before they lend against it. */
export const DSCR_TARGET = 1.25;

export interface FinancingInputs {
  /** The price being paid — the calculated offer, or the seller's asking price */
  price: number;
  downPaymentPct: number;
  interestRatePct: number;
  years: number;
  /** What the building earns before the loan — from the price calculation */
  noi: number;
  kind: PropertyKind;
}

export interface FinancingBreakdown {
  downPayment: number;
  loan: number;
  ltvPct: number;
  monthlyPayment: number;
  annualDebtService: number;
  /** What is left of the NOI once the bank is paid, per year */
  cashFlow: number;
  monthlyCashFlow: number;
  /** Yearly cash flow as a percentage of the money actually put in */
  cashOnCashPct: number | null;
  /** NOI ÷ yearly instalment. Under 1 the building cannot pay its own loan. */
  dscr: number | null;
  /** The biggest loan that still leaves DSCR at the bank's target */
  maxLoanAtTarget: number | null;
  /** Total interest paid over the whole term */
  totalInterest: number;
  /** Things worth saying out loud, most important first */
  warnings: string[];
  problem: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const ok = (n: number) => Number.isFinite(n);

/** Annuity: the fixed monthly payment that clears the loan over the term. */
export function monthlyAnnuity(loan: number, annualRatePct: number, years: number): number {
  if (loan <= 0 || years <= 0) return 0;
  const n = Math.round(years * 12);
  const i = annualRatePct / 100 / 12;
  if (i <= 0) return r2(loan / n);
  return r2((loan * i) / (1 - Math.pow(1 + i, -n)));
}

/**
 * The largest loan whose instalment the building's income still covers by the
 * bank's margin — the ceiling the deal runs into before the down payment does.
 */
export function loanAtDscr(noi: number, annualRatePct: number, years: number, dscr = DSCR_TARGET): number | null {
  if (!ok(noi) || noi <= 0 || years <= 0 || dscr <= 0) return null;
  const affordableAnnual = noi / dscr;
  const n = Math.round(years * 12);
  const i = annualRatePct / 100 / 12;
  const monthly = affordableAnnual / 12;
  if (i <= 0) return r2(monthly * n);
  return r2((monthly * (1 - Math.pow(1 + i, -n))) / i);
}

export function computeFinancing(input: FinancingInputs): FinancingBreakdown {
  const empty: FinancingBreakdown = {
    downPayment: 0, loan: 0, ltvPct: 0, monthlyPayment: 0, annualDebtService: 0,
    cashFlow: 0, monthlyCashFlow: 0, cashOnCashPct: null, dscr: null,
    maxLoanAtTarget: null, totalInterest: 0, warnings: [], problem: null,
  };

  const { price, downPaymentPct, interestRatePct, years, noi, kind } = input;
  if (![price, downPaymentPct, interestRatePct, years, noi].every(ok)) {
    return { ...empty, problem: "Vpiši številke." };
  }
  if (price <= 0) {
    return { ...empty, problem: "Najprej mora iz zgornjega izračuna pasti cena." };
  }
  if (years <= 0) {
    return { ...empty, problem: "Vpiši dobo kredita v letih." };
  }

  const pct = Math.min(Math.max(downPaymentPct, 0), 100);
  const downPayment = r2(price * (pct / 100));
  const loan = r2(price - downPayment);
  const monthlyPayment = monthlyAnnuity(loan, interestRatePct, years);
  const annualDebtService = r2(monthlyPayment * 12);
  const cashFlow = r2(noi - annualDebtService);
  const dscr = annualDebtService > 0 ? r2(noi / annualDebtService) : null;
  const maxLoanAtTarget = loanAtDscr(noi, interestRatePct, years);

  const rule = ruleFor(kind);
  const warnings: string[] = [];

  if (pct < rule.minDownPct) {
    warnings.push(
      `Pri tej vrsti nepremičnine je ${rule.minDownPct} % lastnih sredstev spodnja meja${
        rule.binding === "priporočilo"
          ? " po priporočilu Banke Slovenije"
          : " po praksi bank"
      } — s ${pct} % računaj, da bo banka rekla ne ali zahtevala dodatno zavarovanje.`,
    );
  }

  if (dscr != null && dscr < 1) {
    warnings.push(
      `Najemnine ne pokrijejo obroka: na leto zmanjka ${Math.abs(cashFlow).toLocaleString("sl-SI", { maximumFractionDigits: 0 })} €, ki jih boš dodajal iz svojega žepa.`,
    );
  } else if (dscr != null && dscr < DSCR_TARGET) {
    warnings.push(
      `Najemnine obrok komaj pokrijejo (${dscr.toFixed(2)}×). Banke navadno hočejo vsaj ${DSCR_TARGET.toFixed(2)}× — vsak prazen mesec te vrže v minus.`,
    );
  }

  if (maxLoanAtTarget != null && loan > maxLoanAtTarget) {
    warnings.push(
      `Glede na donos je zgornja meja kredita okoli ${maxLoanAtTarget.toLocaleString("sl-SI", { maximumFractionDigits: 0 })} € — razliko boš moral pokriti z lastnimi sredstvi.`,
    );
  }

  return {
    downPayment,
    loan,
    ltvPct: r2((loan / price) * 100),
    monthlyPayment,
    annualDebtService,
    cashFlow,
    monthlyCashFlow: r2(cashFlow / 12),
    cashOnCashPct: downPayment > 0 ? r2((cashFlow / downPayment) * 100) : null,
    dscr,
    maxLoanAtTarget,
    totalInterest: r2(monthlyPayment * Math.round(years * 12) - loan),
    warnings,
    problem: null,
  };
}
