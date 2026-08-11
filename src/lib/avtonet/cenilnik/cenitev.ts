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

export async function oceniVozilo(cilj: Vozilo, utezi: Utezi = PRIVZETE_UTEZI): Promise<Cenitev> {
  const iskanje = await najdiKandidate(cilj);
  const opozorila: string[] = [];

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
        cena: r.cena_eur === null ? null : Number(r.cena_eur),
        cenaPrvotna: r.cena_prvotna_eur === null ? null : Number(r.cena_prvotna_eur),
        status: r.status,
        jeDealer: r.je_dealer,
        lokacija: r.lokacija,
        firstSeen: r.first_seen,
        statusSpremenjen: r.status_spremenjen,
        dniNaTrgu: dniNaTrgu(r.first_seen, r.status_spremenjen),
        znacilke: r.oprema_znacilke ?? [],
        podobnost: ocena.skupno,
        ocena,
        aiPodobnost: null,
        aiRazlog: null,
      };
      return p;
    })
    .filter((p) => p.podobnost >= PRAG_PODOBNOSTI)
    .sort((a, b) => b.podobnost - a.podobnost)
    .slice(0, NAJVEC_PRIMERLJIVIH);

  // Current market: what comparable cars are asking right now.
  const aktivniZCeno = ocenjeni.filter((p) => p.status === "aktiven" && p.cena !== null && p.cena > 0);
  const aktivni = cenovnaStatistika(aktivniZCeno.map((p) => p.cena as number));

  // Finished adverts: the last price seen before they left the board. NOT a
  // sale price — the source only says "sold" on some of them.
  const zakljuceniVrstice = ocenjeni.filter((p) => p.status !== "aktiven" && p.cena !== null && p.cena > 0);
  const zakljuceni = cenovnaStatistika(zakljuceniVrstice.map((p) => p.cena as number));

  const dnevi = ocenjeni.map((p) => p.dniNaTrgu).filter((d): d is number => d !== null);
  const cas = casNaTrgu(dnevi);

  // The estimate is built on the live market, because that is what a seller
  // will actually be competing against today.
  const osnova = utezenaMediana(
    aktivniZCeno.map((p) => ({ vrednost: p.cena as number, teza: Math.max(1, p.podobnost - PRAG_PODOBNOSTI) }))
  );

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
    const iqr = aktivni.q3 - aktivni.q1;
    const omejen = Math.max(aktivni.q1 - 0.5 * iqr, Math.min(aktivni.q3 + 0.5 * iqr, surov));
    return Math.round(omejen / 50) * 50;
  })();

  const povprecnaPodobnost =
    ocenjeni.length > 0 ? ocenjeni.reduce((a, p) => a + p.podobnost, 0) / ocenjeni.length : 0;

  if (aktivniZCeno.length === 0) {
    opozorila.push(
      "Med primerljivimi vozili ni nobenega z objavljeno ceno, zato vrednosti ni mogoče oceniti."
    );
  } else if (aktivniZCeno.length < 5) {
    opozorila.push(
      `Ocena temelji na samo ${aktivniZCeno.length} primerljivih vozilih z objavljeno ceno — vzemite jo kot grob obseg, ne kot točno številko.`
    );
  }
  if (iskanje.brezModela) {
    opozorila.push("Modela ni bilo mogoče uskladiti z bazo, zato so primerjave iz iste znamke, a drugih modelov.");
  }
  if (cas.vzorec === 0) {
    opozorila.push("Noben primerljiv oglas še ni zaključen, zato časa do prodaje še ni mogoče izmeriti.");
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
      vzorec: aktivniZCeno.length,
      povprecnaPodobnost,
      mediana: aktivni.mediana,
      q1: aktivni.q1,
      q3: aktivni.q3,
    }),
    aktivni,
    zakljuceni,
    cas,
    popravekKm: popravek
      ? { eur: popravek.eur, medianaKmPrimerljivih: popravek.medianaKm, razlaga: popravek.razlaga }
      : null,
    primerljivi: ocenjeni,
    pregledanih: iskanje.vrstice.length,
    oknoLetnika: iskanje.oknoLetnika,
    brezModela: iskanje.brezModela,
    opozorila,
    opomba: iskanje.opomba,
  };
}
