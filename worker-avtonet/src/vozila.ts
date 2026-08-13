import type { Db } from "./db.js";
import { imaVozila } from "./db.js";

/**
 * Same-physical-vehicle linking.
 *
 * A seller pulls an advert and posts the car again days later under a fresh
 * avtonet_id. Without linking, the statistics count the first advert as "sold
 * in N days" — a fake sale. So after every research, each recent advert that is
 * not yet linked is compared against recently finished adverts of the same
 * brand+model, and a confidence score decides:
 *
 *   >= 80  linked automatically (vozilo_id, the old advert gets
 *          naslednji_oglas_id so statistics can exclude its disappearance)
 *   60-79  stored in avtonet_vozila_kandidati for human review
 *   < 60   nothing
 *
 * The score is built from facts that CANNOT change on a real car (hard fails:
 * letnik, motor, menjalnik, gorivo, barva, karoserija) and one that can only
 * move one way: kilometres GROW. A "match" whose mileage went down is not the
 * same car, however identical it looks — that asymmetry is what keeps two
 * identical Renaults apart. Brand-new stock (km < 500) is excluded entirely:
 * five factory-fresh Formentors are indistinguishable and must not be merged.
 */

const OKNO_DNI = 90;
/** Below this mileage the cars are physically indistinguishable — do not link. */
const MIN_KM = 500;
const PRAG_POVEZAVE = 80;
const PRAG_KANDIDATA = 60;
/** How many recent unlinked adverts one pass considers. */
const NAJVEC_NOVIH = 1500;

type Oglas = {
  id: string;
  avtonet_id: string;
  znamka: string | null;
  model: string | null;
  verzija: string | null;
  naziv: string | null;
  letnik: number | null;
  km: number | null;
  ccm: number | null;
  kw: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  barva: string | null;
  karoserija: string | null;
  cena_eur: number | string | null;
  slike_urls: string[] | null;
  first_seen: string;
  status: string;
  status_spremenjen: string | null;
  vozilo_id: string | null;
};

const POLJA =
  "id, avtonet_id, znamka, model, verzija, naziv, letnik, km, ccm, kw, gorivo, menjalnik, " +
  "barva, karoserija, cena_eur, slike_urls, first_seen, status, status_spremenjen, vozilo_id";

function kljuc(v: string | null): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function num(v: number | string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type Ujemanje = { confidence: number; razlogi: string[] };

/**
 * Score for "new advert `nov` is the same car as finished advert `star`".
 * Null on any hard fail. Both must share brand+model (the caller's gate).
 */
export function oceniIstoVozilo(
  nov: Oglas,
  star: Oglas,
  dniVmes: number
): Ujemanje | null {
  let tocke = 20; // the brand+model gate itself
  const razlogi: string[] = ["isti model"];

  // Facts that do not change on a real car: known-and-different = not the car.
  if (nov.letnik !== null && star.letnik !== null) {
    if (nov.letnik !== star.letnik) return null;
    tocke += 20;
    razlogi.push("isti letnik");
  }
  if (nov.ccm !== null && star.ccm !== null) {
    if (Math.abs(nov.ccm - star.ccm) > 20) return null;
    tocke += 10;
  }
  if (nov.kw !== null && star.kw !== null) {
    if (Math.abs(nov.kw - star.kw) > 5) return null;
    tocke += 10;
  }
  if (kljuc(nov.gorivo) && kljuc(star.gorivo)) {
    if (kljuc(nov.gorivo) !== kljuc(star.gorivo)) return null;
    tocke += 8;
  }
  if (kljuc(nov.menjalnik) && kljuc(star.menjalnik)) {
    if (kljuc(nov.menjalnik) !== kljuc(star.menjalnik)) return null;
    tocke += 8;
  }
  if (kljuc(nov.barva) && kljuc(star.barva)) {
    if (kljuc(nov.barva) !== kljuc(star.barva)) return null;
    tocke += 12;
    razlogi.push("ista barva");
  }
  if (kljuc(nov.karoserija) && kljuc(star.karoserija)) {
    if (kljuc(nov.karoserija) !== kljuc(star.karoserija)) return null;
    tocke += 6;
  }

  // Kilometres are ASYMMETRIC: they only grow, and only about as fast as time
  // allows. Down (beyond a rounding sliver) = different car; implausibly up
  // (> ~150 km/day of gap) = different car.
  if (nov.km !== null && star.km !== null) {
    const rast = nov.km - star.km;
    const najvecRasti = Math.max(1, dniVmes) * 150 + 500;
    if (rast < -500 || rast > najvecRasti) return null;
    tocke += 20;
    razlogi.push(rast === 0 ? "isti km" : `km +${rast}`);
  }

  // Price CAN move, so it only adds, never fails.
  const cenaN = num(nov.cena_eur);
  const cenaS = num(star.cena_eur);
  if (cenaN !== null && cenaS !== null && cenaS > 0) {
    if (Math.abs(cenaN - cenaS) / cenaS <= 0.2) {
      tocke += 8;
      razlogi.push("podobna cena");
    }
  }

  // Identical photo URLs are close to proof — sellers reuse them on a relist.
  const slikeN = new Set(nov.slike_urls ?? []);
  if (slikeN.size > 0 && (star.slike_urls ?? []).some((s) => slikeN.has(s))) {
    tocke += 30;
    razlogi.push("iste slike");
  }

  // Shared words of the version/title beyond the model name.
  const wa = new Set(kljuc(nov.verzija ?? nov.naziv).split(" ").filter((w) => w.length > 1));
  const wb = new Set(kljuc(star.verzija ?? star.naziv).split(" ").filter((w) => w.length > 1));
  if (wa.size > 0 && wb.size > 0) {
    let skupnih = 0;
    for (const w of wa) if (wb.has(w)) skupnih++;
    tocke += Math.round((8 * skupnih) / Math.max(1, Math.min(wa.size, wb.size)));
  }

  return { confidence: Math.min(100, tocke), razlogi };
}

type Log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;

/**
 * One linking pass: recent unlinked adverts vs recently finished ones.
 * Runs after a research; cheap because both sides are narrow, indexed slices.
 */
export async function poveziVozila(db: Db, log: Log): Promise<void> {
  if (!(await imaVozila(db))) return;

  const odDatum = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const oknoDatum = new Date(Date.now() - OKNO_DNI * 86_400_000).toISOString();

  // Recent adverts that are not yet linked and are physically identifiable.
  const { data: noviRaw, error: novErr } = await db
    .from("avtonet_oglasi")
    .select(POLJA)
    .is("vozilo_id", null)
    .gte("first_seen", odDatum)
    .gte("km", MIN_KM)
    .order("first_seen", { ascending: false })
    .limit(NAJVEC_NOVIH);
  if (novErr) {
    log("warn", "vozila: branje novih ni uspelo", { napaka: novErr.message });
    return;
  }
  const novi = (noviRaw ?? []) as unknown as Oglas[];
  if (novi.length === 0) return;

  // Group by brand+model so each candidate query is narrow.
  const skupine = new Map<string, Oglas[]>();
  for (const n of novi) {
    const k = `${kljuc(n.znamka)}|${kljuc(n.model)}`;
    if (!kljuc(n.znamka) || !kljuc(n.model)) continue;
    const arr = skupine.get(k) ?? [];
    arr.push(n);
    skupine.set(k, arr);
  }

  let povezanih = 0;
  let kandidatov = 0;

  for (const clani of skupine.values()) {
    const vzorec = clani[0];
    // Finished adverts of the same brand+model in the window, still without a
    // successor — each may explain one new advert's appearance.
    const { data: stariRaw, error: starErr } = await db
      .from("avtonet_oglasi")
      .select(POLJA)
      .in("status", ["izginil", "prodano"])
      .is("naslednji_oglas_id", null)
      .gte("status_spremenjen", oknoDatum)
      .gte("km", MIN_KM)
      .ilike("znamka", vzorec.znamka ?? "")
      .ilike("model", vzorec.model ?? "")
      .limit(300);
    if (starErr || !stariRaw || stariRaw.length === 0) continue;
    const stari = stariRaw as unknown as Oglas[];
    const porabljeni = new Set<string>();

    for (const nov of clani) {
      let najboljsi: { star: Oglas; u: Ujemanje } | null = null;

      for (const star of stari) {
        if (porabljeni.has(star.id) || star.id === nov.id) continue;
        // The old advert must have finished BEFORE the new one appeared.
        const konec = star.status_spremenjen ? new Date(star.status_spremenjen).getTime() : 0;
        const zacetek = new Date(nov.first_seen).getTime();
        if (konec === 0 || konec > zacetek) continue;
        const dniVmes = (zacetek - konec) / 86_400_000;
        if (dniVmes > OKNO_DNI) continue;

        const u = oceniIstoVozilo(nov, star, dniVmes);
        if (u && (!najboljsi || u.confidence > najboljsi.u.confidence)) {
          najboljsi = { star, u };
        }
      }

      if (!najboljsi) continue;

      if (najboljsi.u.confidence >= PRAG_POVEZAVE) {
        // Same vehicle: share (or create) the vozilo, and point the old advert
        // at its continuation so statistics stop counting it as a sale.
        let voziloId = najboljsi.star.vozilo_id;
        if (!voziloId) {
          const { data: v } = await db
            .from("avtonet_vozila")
            .insert({ znamka: nov.znamka, model: nov.model })
            .select("id")
            .maybeSingle();
          voziloId = (v as { id: string } | null)?.id ?? null;
          if (voziloId) {
            await db
              .from("avtonet_oglasi")
              .update({ vozilo_id: voziloId, vozilo_confidence: najboljsi.u.confidence, vozilo_povezava: "ponovna_objava" })
              .eq("id", najboljsi.star.id);
          }
        }
        if (voziloId) {
          await db
            .from("avtonet_oglasi")
            .update({ vozilo_id: voziloId, vozilo_confidence: najboljsi.u.confidence, vozilo_povezava: "ponovna_objava" })
            .eq("id", nov.id);
          await db
            .from("avtonet_oglasi")
            .update({ naslednji_oglas_id: nov.id })
            .eq("id", najboljsi.star.id);
          porabljeni.add(najboljsi.star.id);
          povezanih += 1;
        }
      } else if (najboljsi.u.confidence >= PRAG_KANDIDATA) {
        await db.from("avtonet_vozila_kandidati").upsert(
          {
            nov_oglas_id: nov.id,
            star_oglas_id: najboljsi.star.id,
            confidence: najboljsi.u.confidence,
            razlog: najboljsi.u.razlogi.join(", "),
          },
          { onConflict: "nov_oglas_id,star_oglas_id", ignoreDuplicates: true }
        );
        kandidatov += 1;
      }
    }
  }

  if (povezanih > 0 || kandidatov > 0) {
    log("info", "vozila: povezovanje ponovnih objav", { povezanih, kandidatov, pregledanihNovih: novi.length });
  }
}
