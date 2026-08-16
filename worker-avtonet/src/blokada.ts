import type { Db } from "./db.js";

/**
 * Cross-run block memory.
 *
 * zascita.ts protects a single run from grinding; this protects the SOURCE
 * relationship across runs. Measured on 16.08: the 403 arrived after 631 pages
 * on the 13th, 953 on the 15th, and only 31 pages by midday on the 16th — every
 * attempt into an active block makes the next block come sooner. A scheduler
 * that keeps launching runs (or a person clicking the button) therefore digs
 * the hole deeper.
 *
 * So a 403 now parks collecting for hours — 2, 4, 8, 12, doubling while blocks
 * repeat — and the next run comes back SLOWER (a speed factor that multiplies
 * the configured delays). A run that completes cleanly halves the factor again,
 * so the system finds its own sustainable pace instead of needing someone to
 * tune the numbers by hand.
 */

const STOPNJE_UR = [2, 4, 8, 12];
const KLJUC = "blokada";

export type StanjeBlokade = {
  /** ISO time until which collecting is parked; null = free. */
  do: string | null;
  /** How many blocks in a row — drives both the pause and the speed factor. */
  stopnja: number;
  /** Multiplies the configured delays on the next run (1 = configured speed). */
  faktor: number;
  zadnja: string | null;
  razlog: string | null;
};

const PRAZNO: StanjeBlokade = { do: null, stopnja: 0, faktor: 1, zadnja: null, razlog: null };

export async function preberiBlokado(db: Db): Promise<StanjeBlokade> {
  try {
    const { data } = await db
      .from("avtonet_statistika")
      .select("podatki")
      .eq("kljuc", KLJUC)
      .maybeSingle();
    const p = (data as { podatki: Partial<StanjeBlokade> } | null)?.podatki;
    if (!p) return { ...PRAZNO };
    return {
      do: p.do ?? null,
      stopnja: Number(p.stopnja ?? 0),
      faktor: Math.max(1, Number(p.faktor ?? 1)),
      zadnja: p.zadnja ?? null,
      razlog: p.razlog ?? null,
    };
  } catch {
    return { ...PRAZNO };
  }
}

async function zapisi(db: Db, s: StanjeBlokade): Promise<void> {
  try {
    await db
      .from("avtonet_statistika")
      .upsert({ kljuc: KLJUC, podatki: s, izracunano: new Date().toISOString() });
  } catch {
    // Bookkeeping only: never fail collecting over it.
  }
}

/** True while collecting must stay parked. */
export function blokiran(s: StanjeBlokade): boolean {
  return s.do !== null && new Date(s.do).getTime() > Date.now();
}

export function minutDoKonca(s: StanjeBlokade): number {
  if (!s.do) return 0;
  return Math.max(0, Math.round((new Date(s.do).getTime() - Date.now()) / 60_000));
}

/** A 403/429 ended a run: park collecting and come back slower next time. */
export async function zabelezBlokado(db: Db, razlog: string): Promise<StanjeBlokade> {
  const prej = await preberiBlokado(db);
  const stopnja = Math.min(prej.stopnja + 1, STOPNJE_UR.length);
  const ur = STOPNJE_UR[stopnja - 1];
  const novo: StanjeBlokade = {
    do: new Date(Date.now() + ur * 3_600_000).toISOString(),
    stopnja,
    faktor: Math.min(4, prej.faktor * 2),
    zadnja: new Date().toISOString(),
    razlog: `${razlog} — zbiranje počiva ${ur} h, nato nadaljuje počasneje`,
  };
  await zapisi(db, novo);
  return novo;
}

/** A run finished cleanly: forget the block and give some speed back. */
export async function zabelezUspeh(db: Db): Promise<void> {
  const prej = await preberiBlokado(db);
  if (prej.stopnja === 0 && prej.faktor === 1 && !prej.do) return;
  await zapisi(db, {
    do: null,
    stopnja: 0,
    faktor: Math.max(1, prej.faktor / 2),
    zadnja: prej.zadnja,
    razlog: null,
  });
}
