import "server-only";
import { createAvtonetClient } from "@/lib/avtonet/db";
import {
  normalizirajBarvo,
  normalizirajGorivo,
  normalizirajKaroserijo,
  normalizirajMenjalnik,
  normalizirajPogon,
  type Vozilo,
} from "./vozilo";

/**
 * Finding the cars worth comparing against — cheaply, and before any AI is
 * involved.
 *
 * This is the step that makes the whole feature affordable. The database holds
 * tens of thousands of adverts; sending them to a model would cost a fortune
 * and answer worse. So the database does what a database is good at (exact
 * filters on indexed columns), scoring narrows further, and only a short list
 * ever reaches an AI.
 *
 * The widening is the interesting part. A tight year window gives the best
 * comparables but often too few of them, so the window opens step by step until
 * there is enough to say something — and the step it stopped at is returned, so
 * the screen can admit "we had to look ±4 years to find enough cars" instead of
 * quietly presenting a weaker answer as a strong one.
 */

export type KandidatVrstica = {
  id: string;
  /** Ali je oglas prenovljena razlicica serije. null = ni znano. */
  facelift?: boolean | null;
  /** Ali zanesljivo vemo, kdaj je prisel na trg (sicer casa ni mogoce meriti). */
  vstop_znan?: boolean | null;
  vstop_na_trg?: string | null;
  avtonet_id: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  verzija: string | null;
  letnik: number | null;
  km: number | null;
  ccm: number | null;
  kw: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  pogon: string | null;
  karoserija: string | null;
  barva: string | null;
  serija: number | null;
  oprema_znacilke: string[] | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  status: string;
  first_seen: string;
  last_seen: string;
  status_spremenjen: string | null;
  je_dealer: boolean | null;
  lokacija: string | null;
  source_zadnja_sprememba: string | null;
  naslednji_oglas_id: string | null;
};

const STOLPCI_OSNOVA =
  "id, avtonet_id, url, naziv, znamka, model, verzija, letnik, km, ccm, kw, gorivo, menjalnik, " +
  "pogon, karoserija, barva, serija, cena_eur, cena_prvotna_eur, status, first_seen, last_seen, " +
  "status_spremenjen, je_dealer, lokacija, source_zadnja_sprememba, naslednji_oglas_id" +
  ", vstop_znan, vstop_na_trg, facelift";

const STOLPCI = `${STOLPCI_OSNOVA}, oprema_znacilke`;

/**
 * Postgres' code for "column does not exist", which here means one thing:
 * migration_avtonet_detajl_v2.sql has not been run yet.
 *
 * The valuation degrades to working without equipment matching rather than
 * failing outright. A feature that is dead until somebody remembers to paste
 * SQL into a dashboard is a feature that looks broken, and the equipment part
 * is an improvement to the comparison — not a precondition for having one.
 */
const NI_STOLPCA = "42703";

let brezZnacilk = false;

/** How far the year window is allowed to open, in order. */
const OKNA_LETNIKA = [2, 3, 4, 6];

/** Below this the sample is too thin to be worth scoring; widen instead. */
const DOVOLJ = 12;

export type IskanjeKandidatov = {
  vrstice: KandidatVrstica[];
  /** The year window that was actually used (± years), or null if year unknown. */
  oknoLetnika: number | null;
  /** True when the model filter had to be dropped to find anything at all. */
  brezModela: boolean;
  opomba: string;
};

export function vVozilo(r: KandidatVrstica): Vozilo {
  return {
    znamka: r.znamka,
    model: r.model,
    verzija: r.verzija,
    letnik: r.letnik,
    km: r.km,
    ccm: r.ccm,
    kw: r.kw,
    gorivo: normalizirajGorivo(r.gorivo),
    menjalnik: normalizirajMenjalnik(r.menjalnik),
    pogon: normalizirajPogon(r.pogon),
    karoserija: normalizirajKaroserijo(r.karoserija),
    barva: normalizirajBarvo(r.barva),
    znacilke: r.oprema_znacilke ?? [],
    serija: r.serija,
    cena: r.cena_eur === null ? null : Number(r.cena_eur),
    valuta: "EUR",
  };
}

/**
 * Candidates for one target vehicle.
 *
 * Deliberately NOT filtered by price: the question is what this car is worth,
 * and restricting the search to cars that already cost about that much would
 * make the answer circular.
 */
export async function najdiKandidate(cilj: Vozilo, najvec = 400): Promise<IskanjeKandidatov> {
  const db = createAvtonetClient();

  if (!cilj.znamka) {
    return { vrstice: [], oknoLetnika: null, brezModela: false, opomba: "Znamka vozila ni znana, zato primerjave ni mogoče poiskati." };
  }

  const poizvedba = (oknoLet: number | null, zModelom: boolean, zSerijo = true) => {
    let q = db
      .from("avtonet_oglasi")
      .select(brezZnacilk ? STOLPCI_OSNOVA : STOLPCI)
      .ilike("znamka", cilj.znamka!);

    if (zModelom && cilj.model) {
      // The `model` column is not always clean: many rows (older ones, and some
      // brands the title-splitter did not catch) carry the WHOLE advert title in
      // `model`, e.g. "Formentor 4Drive 2.0 TDI DSG+VIRTUAL+KAMERA…". An exact
      // `ilike('model','Formentor')` then matches almost none — measured: 8 of
      // 60+ real Formentors in the DB. So the model name is matched as a
      // SUBSTRING of the model OR of the title, where it reliably appears.
      const vzorec = cilj.model.replace(/[%,*()]/g, " ").trim();
      if (vzorec) q = q.or(`model.ilike.*${vzorec}*,naziv.ilike.*${vzorec}*`);
    }

    // Fuel is a hard filter: a diesel and a petrol of the same model are
    // different products with different prices, so mixing them would not widen
    // the sample, it would poison it.
    if (cilj.gorivo) {
      const vzorci: Record<string, string> = {
        diesel: "diesel", bencin: "bencin", elektro: "elektr", hibrid: "hibrid", plin: "plin",
      };
      const vz = vzorci[cilj.gorivo];
      if (vz) q = q.ilike("gorivo", `%${vz}%`);
    }

    if (oknoLet !== null && cilj.letnik !== null) {
      q = q.gte("letnik", cilj.letnik - oknoLet).lte("letnik", cilj.letnik + oknoLet);
    }

    /**
     * Serija (facelift / nova izvedba) je trd filter, kadar je znana.
     *
     * Letnik sam tega ne ujame: X6 xDrive30d iz 4/2019 je še stara izvedba
     * (190 kW), tisti iz 3/2020 pa nova (195 kW) — v naših podatkih 28.587 €
     * proti 53.996 €. Če jih ne ločimo, cenitev starega avta dvigne cena
     * novega. Kadar zadetkov zmanjka, se filter spusti in to se izrecno pove.
     */
    if (zSerijo && cilj.serija !== null && cilj.serija !== undefined) {
      q = q.eq("serija", cilj.serija);
    }

    return q.limit(najvec);
  };

  /** Runs a query, degrading once if the equipment column is not there yet. */
  const izvedi = async (oknoLet: number | null, zModelom: boolean, zSerijo = true): Promise<KandidatVrstica[]> => {
    const prvi = await poizvedba(oknoLet, zModelom, zSerijo);
    if (!prvi.error) return (prvi.data ?? []) as unknown as KandidatVrstica[];
    if (prvi.error.code === NI_STOLPCA && !brezZnacilk) {
      brezZnacilk = true;
      const drugi = await poizvedba(oknoLet, zModelom, zSerijo);
      if (drugi.error) throw new Error(`Iskanje primerljivih vozil ni uspelo: ${drugi.error.message}`);
      return (drugi.data ?? []) as unknown as KandidatVrstica[];
    }
    throw new Error(`Iskanje primerljivih vozil ni uspelo: ${prvi.error.message}`);
  };

  const opombe: string[] = [];
  const imaSerijo = cilj.serija !== null && cilj.serija !== undefined;

  // Step 1: model + progressively wider year window. Najprej ZNOTRAJ serije;
  // šele če tako ni dovolj primerljivih, se serija spusti — in to se pove.
  if (cilj.letnik !== null) {
    for (const zSerijo of imaSerijo ? [true, false] : [false]) {
      for (const okno of OKNA_LETNIKA) {
        const vrstice = await izvedi(okno, true, zSerijo);
        const dovolj = vrstice.length >= DOVOLJ;
        const zadnjeOkno = okno === OKNA_LETNIKA[OKNA_LETNIKA.length - 1];
        // Pri zadnjem oknu brez serije vzamemo, kar je — sicer ne bi imeli nič.
        if (dovolj || (zadnjeOkno && vrstice.length > 0 && (!zSerijo || !imaSerijo))) {
          opombe.push(`letnik ±${okno} let${dovolj ? "" : ", vzorec je majhen"}`);
          if (imaSerijo) {
            opombe.push(
              zSerijo
                ? "samo ista izvedba (facelift/serija)"
                : "⚠️ vključene tudi druge izvedbe (facelift), ker primerljivih iste ni dovolj"
            );
          }
          return { vrstice, oknoLetnika: okno, brezModela: false, opomba: opombe.join(", ") };
        }
      }
    }
  } else {
    const vrstice = await izvedi(null, true);
    if (vrstice.length > 0) {
      opombe.push("letnik ni znan, zato ni omejen");
      return { vrstice, oknoLetnika: null, brezModela: false, opomba: opombe.join(", ") };
    }
  }

  // Step 2: same brand, any model. Worse comparables, but an honest fallback —
  // and the caller is told, so the screen can say the model was not matched.
  const vrstice = await izvedi(cilj.letnik !== null ? 4 : null, false);
  opombe.push("modela ni bilo mogoče uskladiti, primerjava je po znamki");
  return {
    vrstice,
    oknoLetnika: cilj.letnik !== null ? 4 : null,
    brezModela: true,
    opomba: opombe.join(", "),
  };
}
