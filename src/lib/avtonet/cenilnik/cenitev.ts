import "server-only";
import { najdiKandidate, vVozilo, type KandidatVrstica } from "./kandidati";
import { oceniPodobnost, PRIVZETE_UTEZI, type Ocena, type Utezi } from "./podobnost";
import {
  casNaTrgu,
  cenovnaStatistika,
  dniNaTrgu,
  median,
  zanesljivost,
  type CasNaTrgu,
  type CenovnaStatistika,
} from "./statistika";
import { opisVozila, type Vozilo } from "./vozilo";
import {
  oceniProdajo,
  prodajnaStatistikaKohorte,
  utezProdaje,
  type KohortnaProdaja,
  type ProdajaOcena,
} from "@/lib/avtonet/analiza";

/**
 * The valuation itself: database first, statistics second, AI only for
 * explaining.
 *
 * The single most important property of this file is that **no price here is
 * invented**. The estimate is the similarity-weighted median of what
 * comparable Slovenian cars actually ask; the recommended and quick-sale
 * figures are quartiles of that same real distribution, not the estimate
 * multiplied by a number somebody liked. If the data cannot support a figure,
 * the figure is null and the screen says so.
 *
 * The second property: an advert that vanished is not a sale. Prices from
 * finished adverts are reported as "last seen before it left the board", and
 * the field is named that way so a screen cannot round it up into a sale price.
 */

export type Primerljiv = {
  avtonetId: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  verzija: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  /** Normalised body key (limuzina, karavan, suv …) — the AI pass compares it explicitly. */
  karoserija: string | null;
  cena: number | null;
  cenaPrvotna: number | null;
  status: string;
  jeDealer: boolean | null;
  lokacija: string | null;
  firstSeen: string;
  statusSpremenjen: string | null;
  dniNaTrgu: number | null;
  znacilke: string[];
  podobnost: number;
  ocena: Ocena;
  /** Filled by the AI pass when it ran; null otherwise. */
  aiPodobnost: number | null;
  aiRazlog: string | null;
  /** For finished ads: how confidently it was actually sold, and why. Null for active. */
  prodaja: ProdajaOcena | null;
  /** True when this ad's disappearance was a RELIST (same car, new id) — not a sale. */
  jePonovnaObjava: boolean;
};

export type Cenitev = {
  cilj: Vozilo;
  opisCilja: string;

  /** Similarity-weighted median of comparable asking prices, in EUR. */
  ocenjenaVrednost: number | null;
  /** Interquartile range of the comparables — the honest spread, not a guess. */
  razponSpodaj: number | null;
  razponZgoraj: number | null;
  /** Upper quartile: still within what comparable cars ask. */
  priporocenaCena: number | null;
  /** Lower quartile: under most comparable asks. */
  hitraProdaja: number | null;

  zanesljivost: number;
  aktivni: CenovnaStatistika;
  zakljuceni: CenovnaStatistika;
  cas: CasNaTrgu;

  /**
   * Comparables that left the board within HITRO_DNI — the market's own verdict.
   * A car that vanished in two weeks was priced at or under what buyers accept,
   * so its last seen price is the closest thing public data has to a sale
   * price, and it pulls the estimate harder than any asking price does.
   */
  hitroIzginuli: {
    vzorec: number;
    medianaZadnjeCene: number | null;
    medianaDni: number | null;
    pragDni: number;
  };

  /**
   * Weighted sale-speed statistics over the finished comparables — the cohort's
   * own answer to "how fast does THIS kind of car sell, and at what price".
   * Weights combine similarity with sale confidence, so a doubtful withdrawal
   * barely counts. Feeds the KodaTim ocena (Deal Intelligence) card.
   */
  kohorta: KohortnaProdaja;

  /** Correction applied because the target's mileage differs from the comparables'. */
  popravekKm: { eur: number; medianaKmPrimerljivih: number | null; razlaga: string } | null;

  primerljivi: Primerljiv[];
  /** How many rows the database returned before scoring. */
  pregledanih: number;
  oknoLetnika: number | null;
  brezModela: boolean;
  opozorila: string[];
  opomba: string;
};

/** Comparables kept after scoring. Enough for a stable median, few enough for an AI pass. */
const NAJVEC_PRIMERLJIVIH = 40;

/** Below this similarity a car is not a comparable, whatever the filters said. */
const PRAG_PODOBNOSTI = 45;

/**
 * Gone within this many days reads as "the price was right". The number needs
 * a reason: on the market data collected so far the overall median time on the
 * board sits around two to three weeks, so three weeks separates "moved
 * noticeably faster than typical" from merely "eventually left".
 */
export const HITRO_DNI = 21;

/** Slower than this before vanishing means the price was NOT what moved it. */
const POCASI_DNI = 60;

/**
 * Half-life for aging a finished advert's last price. Used-car prices drift —
 * a specimen that vanished nine months ago at 16,000 € says something, but not
 * as much as one that vanished last week, and with a 180-day half-life it
 * counts about a third as much.
 */
const RAZPOLOVNI_CAS_DNI = 180;

/**
 * How hard one finished advert's last price pulls, relative to an active
 * asking price of the same similarity.
 *
 * The reasoning, stated because the numbers look arbitrary without it: an
 * asking price is an owner's OPINION of the value; a fast disappearance is the
 * market ACCEPTING a price, which is strictly better evidence — hence 1.5×.
 * A slow disappearance is ambiguous (price cut? withdrawn? sold reluctantly?),
 * so it still counts, but at half weight. In between, linear.
 *
 * Everything is then discounted by age. Exported so the tests can pin the
 * ordering (fast > slow, fresh > stale) instead of trusting the prose.
 */
export function utezKoncanega(dniNaTrgu: number, starostDni: number): number {
  const hitrost =
    dniNaTrgu <= HITRO_DNI
      ? 1.5
      : dniNaTrgu >= POCASI_DNI
        ? 0.5
        : 1.5 - ((dniNaTrgu - HITRO_DNI) / (POCASI_DNI - HITRO_DNI)) * 1.0;
  const staranje = Math.pow(0.5, Math.max(0, starostDni) / RAZPOLOVNI_CAS_DNI);
  return hitrost * staranje;
}

/** Minimum comparables before a mileage slope is worth fitting at all. */
const MIN_ZA_REGRESIJO = 10;

/**
 * How much of the price variation the mileage actually explains before the
 * correction is allowed to fire. Fitted to a dozen noisy adverts, a slope can
 * be anything; R² is the check on whether there is a relationship to use.
 */
const MIN_R2 = 0.25;

/** The correction may never move the estimate by more than this share of it. */
const NAJVECJI_POPRAVEK = 0.15;

/**
 * A mileage correction derived from the data, not from a rule of thumb.
 *
 * Least-squares slope of price against mileage within the comparable set: if
 * the comparables sit at 90,000 km and the target has 160,000, the estimate has
 * to come down, and this specific set of cars is what can say by how much.
 *
 * Three guards, and they are not decoration — the first version had only a
 * clamp and a verification run caught it adding +7,750 € to a car whose
 * comparables had a median price of 26,470 €, purely because a slope fitted to
 * 12 scattered adverts came out steeply positive and hit the clamp:
 *
 *   n         at least 10 points, or there is nothing to fit
 *   R²        the mileage must explain at least a quarter of the price spread,
 *             otherwise there is no relationship to extrapolate along
 *   negative  more mileage cannot mean more money; a positive slope is noise
 *             or a confound (newer cars driven more), never a real effect
 *
 * A wrong correction is worse than none, so failing any guard returns null and
 * the estimate stands uncorrected.
 */
function popravekZaKilometre(
  tocke: { km: number; cena: number }[],
  ciljKm: number | null,
  osnova: number
): { eur: number; medianaKm: number | null; razlaga: string } | null {
  if (ciljKm === null || tocke.length < MIN_ZA_REGRESIJO || osnova <= 0) return null;

  const medianaKm = median(tocke.map((t) => t.km));
  if (medianaKm === null) return null;

  const povpKm = tocke.reduce((a, t) => a + t.km, 0) / tocke.length;
  const povpCena = tocke.reduce((a, t) => a + t.cena, 0) / tocke.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const t of tocke) {
    sxy += (t.km - povpKm) * (t.cena - povpCena);
    sxx += (t.km - povpKm) ** 2;
    syy += (t.cena - povpCena) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;

  const naklon = sxy / sxx; // EUR per km; a real effect is negative
  if (!Number.isFinite(naklon) || naklon >= 0) return null;

  const r2 = (sxy * sxy) / (sxx * syy);
  if (!Number.isFinite(r2) || r2 < MIN_R2) return null;

  const surov = naklon * (ciljKm - medianaKm);
  const meja = osnova * NAJVECJI_POPRAVEK;
  const eur = Math.max(-meja, Math.min(meja, surov));
  if (Math.abs(eur) < osnova * 0.01) return null;

  const razlikaKm = Math.round((ciljKm - medianaKm) / 1000);
  return {
    eur: Math.round(eur),
    medianaKm,
    razlaga:
      `Vozilo ima ${Math.abs(razlikaKm)}.000 km ${razlikaKm > 0 ? "več" : "manj"} od mediane primerljivih ` +
      `(${Math.round(medianaKm).toLocaleString("sl-SI")} km). Po teh oglasih kilometrina pojasni ` +
      `${Math.round(r2 * 100)} % razlik v ceni, kar pomeni ` +
      `${eur > 0 ? "+" : ""}${Math.round(eur).toLocaleString("sl-SI")} €.`,
  };
}

/** Similarity-weighted median: closer cars pull the answer harder. */
function utezenaMediana(tocke: { vrednost: number; teza: number }[]): number | null {
  const veljavne = tocke.filter((t) => Number.isFinite(t.vrednost) && t.teza > 0);
  if (veljavne.length === 0) return null;
  const urejene = [...veljavne].sort((a, b) => a.vrednost - b.vrednost);
  const skupna = urejene.reduce((a, t) => a + t.teza, 0);
  let tekoca = 0;
  for (const t of urejene) {
    tekoca += t.teza;
    if (tekoca >= skupna / 2) return t.vrednost;
  }
  return urejene[urejene.length - 1].vrednost;
}

/**
 * One number for "how comparable", combining both judges when both have spoken:
 * the algorithm's score is grounded in measured fields, the AI's in wording.
 */
export function skupnaPodobnost(p: Primerljiv): number {
  return p.aiPodobnost === null ? p.podobnost : Math.round((p.podobnost + p.aiPodobnost) / 2);
}

type MetaIskanja = {
  pregledanih: number;
  oknoLetnika: number | null;
  brezModela: boolean;
  opomba: string;
};

export async function oceniVozilo(cilj: Vozilo, utezi: Utezi = PRIVZETE_UTEZI): Promise<Cenitev> {
  const iskanje = await najdiKandidate(cilj);

  const ocenjeni = iskanje.vrstice
    .map((r: KandidatVrstica) => {
      const v = vVozilo(r);
      const ocena = oceniPodobnost(cilj, v, utezi);
      const p: Primerljiv = {
        avtonetId: r.avtonet_id,
        url: r.url,
        naziv: r.naziv,
        znamka: r.znamka,
        model: r.model,
        verzija: r.verzija,
        letnik: r.letnik,
        km: r.km,
        kw: r.kw,
        karoserija: v.karoserija,
        cena: r.cena_eur === null ? null : Number(r.cena_eur),
        cenaPrvotna: r.cena_prvotna_eur === null ? null : Number(r.cena_prvotna_eur),
        status: r.status,
        jeDealer: r.je_dealer,
        lokacija: r.lokacija,
        firstSeen: r.first_seen,
        statusSpremenjen: r.status_spremenjen,
        dniNaTrgu: dniNaTrgu(r.vstop_znan, r.vstop_na_trg, r.status_spremenjen),
        // Facelift iz baze pristane med znacilkami, ker vrata v podobnosti
        // berejo prav tam - isti kanal kot za branje lokalnega modela.
        znacilke: [
          ...(r.oprema_znacilke ?? []),
          ...(r.facelift === true ? ["facelift"] : r.facelift === false ? ["predfacelift"] : []),
        ],
        podobnost: ocena.skupno,
        ocena,
        aiPodobnost: null,
        aiRazlog: null,
        prodaja: null,
        jePonovnaObjava: r.naslednji_oglas_id !== null && r.naslednji_oglas_id !== undefined,
      };
      return p;
    })
    .filter((p) => p.podobnost >= PRAG_PODOBNOSTI)
    .sort((a, b) => b.podobnost - a.podobnost)
    .slice(0, NAJVEC_PRIMERLJIVIH);

  return sestaviCenitev(cilj, ocenjeni, {
    pregledanih: iskanje.vrstice.length,
    oknoLetnika: iskanje.oknoLetnika,
    brezModela: iskanje.brezModela,
    opomba: iskanje.opomba,
  });
}

/**
 * Recomputes every figure after the AI similarity pass.
 *
 * This exists because of a real mis-valuation, not hygiene: on the first live
 * mobile.de test the statistics were computed once, before the AI pass. The AI
 * then correctly threw out the A4s, A5s, Q3s and stronger engines ("To je Audi
 * A4, ne A3" — 0 %), but the estimate had already been fixed from the polluted
 * set, and came out ~4,000 € above what the true peers ask. Judging and THEN
 * ignoring the judgment is worse than not judging at all — so after the AI
 * speaks, everything is recomputed from the survivors.
 */
export function preracunajPoPreverbi(cenitev: Cenitev): Cenitev {
  const preracunano = sestaviCenitev(cenitev.cilj, cenitev.primerljivi, {
    pregledanih: cenitev.pregledanih,
    oknoLetnika: cenitev.oknoLetnika,
    brezModela: cenitev.brezModela,
    opomba: cenitev.opomba,
  });

  const izlocil = cenitev.primerljivi.length - preracunano.primerljivi.length;
  if (izlocil > 0) {
    preracunano.opozorila.push(
      `AI preverba je iz izračuna izločila ${izlocil} vozil, ki so drug model ali motor (ostanejo vidna na dnu seznama).`
    );
  }
  return preracunano;
}

function sestaviCenitev(cilj: Vozilo, kandidatiVsi: Primerljiv[], meta: MetaIskanja): Cenitev {
  const opozorila: string[] = [];

  // The numbers come only from cars still comparable under the COMBINED score —
  // after the AI pass, an algorithmically-similar A4 with AI 0 % falls out here.
  // The full list is kept for the screen, sorted best-first, so the user can
  // see what was excluded and why.
  const ocenjeni = kandidatiVsi
    .filter((p) => skupnaPodobnost(p) >= PRAG_PODOBNOSTI)
    .sort((a, b) => skupnaPodobnost(b) - skupnaPodobnost(a));

  // Current market: what comparable cars are asking right now.
  const aktivniZCeno = ocenjeni.filter((p) => p.status === "aktiven" && p.cena !== null && p.cena > 0);
  const aktivni = cenovnaStatistika(aktivniZCeno.map((p) => p.cena as number));

  // Finished adverts: the last price seen before they left the board. NOT a
  // sale price — the source only says "sold" on some of them. Relists are
  // excluded outright: a disappearance explained by the same car reappearing
  // under a new id is not the market accepting a price.
  const zakljuceniVrstice = ocenjeni.filter(
    (p) => p.status !== "aktiven" && p.cena !== null && p.cena > 0 && !p.jePonovnaObjava
  );
  const zakljuceni = cenovnaStatistika(zakljuceniVrstice.map((p) => p.cena as number));

  const dnevi = ocenjeni.map((p) => p.dniNaTrgu).filter((d): d is number => d !== null);
  const cas = casNaTrgu(dnevi);

  // Sale confidence per finished ad, read against its peers: a cheaper-than-peers
  // ad that left fast is almost certainly a sale; one that sat far longer than
  // peers (or well above their price) is the doubtful one — likely pulled,
  // expired or a problem listing. Peer references: the active asking median for
  // price, the finished-set median for days.
  const medCenaRef = aktivni.mediana ?? zakljuceni.mediana;
  for (const p of zakljuceniVrstice) {
    p.prodaja = oceniProdajo({
      status: p.status,
      dniNaTrgu: p.dniNaTrgu,
      cena: p.cena,
      medianaDni: cas.medianaDni,
      medianaCene: medCenaRef,
    });
  }

  // The cohort's sale-speed figures, weighted by similarity × sale confidence:
  // what the Deal Intelligence card reports as "cars like this one sell in…".
  const kohorta = prodajnaStatistikaKohorte(
    zakljuceniVrstice.map((p) => ({
      dniNaTrgu: p.dniNaTrgu,
      zadnjaCena: p.cena,
      prvotnaCena: p.cenaPrvotna,
      utez:
        Math.max(1, skupnaPodobnost(p) - PRAG_PODOBNOSTI) *
        utezProdaje(p.prodaja?.stopnja ?? "verjetno"),
    }))
  );

  const zdaj = Date.now();
  const hitri = zakljuceniVrstice.filter(
    (p) => p.dniNaTrgu !== null && p.dniNaTrgu <= HITRO_DNI
  );
  const hitroIzginuli = {
    vzorec: hitri.length,
    medianaZadnjeCene: median(hitri.map((p) => p.cena as number)),
    medianaDni: median(hitri.map((p) => p.dniNaTrgu as number)),
    pragDni: HITRO_DNI,
  };

  // The estimate blends two kinds of evidence, and they are not equals.
  //
  // An active advert contributes its ASKING price — the owner's opinion. A
  // finished advert contributes the last price seen before it left the board,
  // and if it left fast at a keen price, that is the market ACCEPTING a price:
  // the closest thing public data has to a transaction. So finished adverts
  // enter the same weighted median as the actives, scaled by utezProdaje — a
  // confident cheap-and-fast sale pulls ~1.5×, a doubtful long/overpriced
  // disappearance only ~0.35× (it was probably pulled, not sold), everything
  // additionally discounted by how long ago it left.
  //
  // With no history yet the pool is all asks and the estimate behaves exactly
  // as before; as research rounds accumulate disappearances, the number
  // gravitates from "what sellers want" toward "what buyers accepted".
  const osnova = utezenaMediana([
    ...aktivniZCeno.map((p) => ({
      vrednost: p.cena as number,
      teza: Math.max(1, skupnaPodobnost(p) - PRAG_PODOBNOSTI),
    })),
    ...zakljuceniVrstice
      .filter((p) => p.dniNaTrgu !== null && p.statusSpremenjen !== null)
      .map((p) => {
        const starostDni = (zdaj - new Date(p.statusSpremenjen as string).getTime()) / 86_400_000;
        // Weight = similarity × sale confidence × age decay. A confidently-sold
        // cheap-and-fast ad (zelo_verjetno / potrjeno) pulls hard; a doubtful
        // long/overpriced disappearance (negotovo) barely counts, so it can't
        // drag the estimate toward a price that was probably never accepted.
        const staranje = Math.pow(0.5, Math.max(0, starostDni) / RAZPOLOVNI_CAS_DNI);
        return {
          vrednost: p.cena as number,
          teza:
            Math.max(1, skupnaPodobnost(p) - PRAG_PODOBNOSTI) *
            utezProdaje(p.prodaja?.stopnja ?? "verjetno") *
            staranje,
        };
      }),
  ]);

  const popravek =
    osnova !== null
      ? popravekZaKilometre(
          aktivniZCeno
            .filter((p) => p.km !== null)
            .map((p) => ({ km: p.km as number, cena: p.cena as number })),
          cilj.km,
          osnova
        )
      : null;

  // The estimate may not leave the range of prices it was computed from. An
  // answer above every comparable car on the market is not a valuation, it is
  // an extrapolation — and extrapolating off the end of the evidence is exactly
  // what the mileage correction was caught doing.
  const ocenjenaVrednost = (() => {
    if (osnova === null) return null;
    const surov = osnova + (popravek?.eur ?? 0);
    if (aktivni.q1 === null || aktivni.q3 === null) return Math.round(surov / 50) * 50;
    // Half an interquartile range beyond the quartiles: a genuinely newer or
    // lower-mileage car may be worth more than three quarters of its
    // comparables, but not more than the market it is being compared to.
    //
    // The floor additionally admits the fast-disappearance median: when the
    // market's own verdict sits below every current ask, the estimate is
    // allowed to follow the verdict rather than being pinned to sellers' hopes.
    const iqr = aktivni.q3 - aktivni.q1;
    const spodnja = Math.min(
      aktivni.q1 - 0.5 * iqr,
      hitroIzginuli.medianaZadnjeCene ?? Number.POSITIVE_INFINITY
    );
    const omejen = Math.max(spodnja, Math.min(aktivni.q3 + 0.5 * iqr, surov));
    return Math.round(omejen / 50) * 50;
  })();

  const povprecnaPodobnost =
    ocenjeni.length > 0 ? ocenjeni.reduce((a, p) => a + skupnaPodobnost(p), 0) / ocenjeni.length : 0;

  if (aktivniZCeno.length === 0) {
    opozorila.push(
      "Med primerljivimi vozili ni nobenega z objavljeno ceno, zato vrednosti ni mogoče oceniti."
    );
  } else if (aktivniZCeno.length < 5) {
    opozorila.push(
      `Ocena temelji na samo ${aktivniZCeno.length} primerljivih vozilih z objavljeno ceno — vzemite jo kot grob obseg, ne kot točno številko.`
    );
  }
  if (meta.brezModela) {
    opozorila.push("Modela ni bilo mogoče uskladiti z bazo, zato so primerjave iz iste znamke, a drugih modelov.");
  }
  if (cas.vzorec === 0) {
    opozorila.push(
      "Noben primerljiv oglas še ni zaključen — ocena zato temelji samo na zahtevanih cenah, ki so praviloma višje od iztrženih. Z vsakim krogom raziskave se to izboljšuje."
    );
  }
  if (aktivni.izlocenih > 0) {
    opozorila.push(`${aktivni.izlocenih} oglasov z izstopajočo ceno je bilo izločenih iz izračuna.`);
  }

  return {
    cilj,
    opisCilja: opisVozila(cilj),
    ocenjenaVrednost,
    razponSpodaj: aktivni.q1 === null ? null : Math.round(aktivni.q1 / 50) * 50,
    razponZgoraj: aktivni.q3 === null ? null : Math.round(aktivni.q3 / 50) * 50,
    // Deliberately the real quartiles rather than the estimate times a chosen
    // number: "ask this" means "still inside what comparable cars ask", and
    // "sell fast" means "under most of them".
    priporocenaCena: aktivni.q3 === null ? null : Math.round(aktivni.q3 / 50) * 50,
    hitraProdaja: aktivni.q1 === null ? null : Math.round(aktivni.q1 / 50) * 50,
    zanesljivost: zanesljivost({
      vzorec: aktivniZCeno.length + hitri.length,
      povprecnaPodobnost,
      mediana: aktivni.mediana,
      q1: aktivni.q1,
      q3: aktivni.q3,
    }),
    aktivni,
    zakljuceni,
    cas,
    hitroIzginuli,
    kohorta,
    popravekKm: popravek
      ? { eur: popravek.eur, medianaKmPrimerljivih: popravek.medianaKm, razlaga: popravek.razlaga }
      : null,
    // The FULL list, excluded rows included, sorted best-first — the screen
    // shows what was thrown out and why, the numbers above ignore it.
    primerljivi: [...kandidatiVsi].sort((a, b) => skupnaPodobnost(b) - skupnaPodobnost(a)),
    pregledanih: meta.pregledanih,
    oknoLetnika: meta.oknoLetnika,
    brezModela: meta.brezModela,
    opozorila,
    opomba: meta.opomba,
  };
}
