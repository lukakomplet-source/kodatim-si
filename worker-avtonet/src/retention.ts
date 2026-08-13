import type { Db } from "./db.js";

/**
 * Keeps the local avtonet database bounded.
 *
 * The worker touches (nearly) every advert on every sweep, so price snapshots
 * and research-log events are what actually grow. Rather than let the database
 * fill the disk, the OLDEST of that churn is pruned on a schedule:
 *
 *   - price snapshots older than RETENTION_POSNETKI days
 *   - research-log events older than RETENTION_DOGODKI days
 *   - finished adverts (izginil/prodano) older than RETENTION_OGLASI days
 *
 * Deleting frees the rows for Postgres to reuse (autovacuum), which is what
 * stops unbounded growth; the physical file plateaus rather than shrinking to
 * zero, which is exactly what we want. The DB size is read via the
 * avtonet_db_size RPC and logged, and if it is over the cap the snapshot window
 * is tightened in one extra pass so the oldest data goes first.
 */

const DAN_MS = 86_400_000;

const DNI_POSNETKI = Number(process.env.AVTONET_RETENTION_POSNETKI_DNI ?? 120);
const DNI_DOGODKI = Number(process.env.AVTONET_RETENTION_DOGODKI_DNI ?? 30);
const DNI_OGLASI = Number(process.env.AVTONET_RETENTION_OGLASI_DNI ?? 180);
const CAP_BYTES = Number(process.env.AVTONET_MAX_BYTES ?? 50 * 1024 ** 3);

type Log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;

async function velikost(db: Db): Promise<number | null> {
  try {
    const { data, error } = await db.rpc("avtonet_db_size");
    if (error || data == null) return null;
    return Number(data);
  } catch {
    return null;
  }
}

function predDnevi(dni: number): string {
  return new Date(Date.now() - dni * DAN_MS).toISOString();
}

export async function pociistiStareVnose(db: Db, log: Log): Promise<void> {
  const preBytes = await velikost(db);

  const posnetki = await db.from("avtonet_posnetki").delete().lt("zajeto", predDnevi(DNI_POSNETKI));
  const dogodki = await db.from("avtonet_dogodki").delete().lt("ob", predDnevi(DNI_DOGODKI));
  const oglasi = await db
    .from("avtonet_oglasi")
    .delete()
    .in("status", ["izginil", "prodano"])
    .lt("status_spremenjen", predDnevi(DNI_OGLASI));

  // If still over the cap, take the oldest snapshots down to a tighter window —
  // snapshots are the bulk and the least precious (a price on some day months
  // ago), so they go before adverts do.
  let postBytes = await velikost(db);
  let dodatniKrogi = 0;
  let okno = DNI_POSNETKI;
  while (postBytes !== null && postBytes > CAP_BYTES && okno > 14 && dodatniKrogi < 6) {
    okno = Math.max(14, Math.floor(okno / 2));
    await db.from("avtonet_posnetki").delete().lt("zajeto", predDnevi(okno));
    postBytes = await velikost(db);
    dodatniKrogi += 1;
  }

  log("info", "retention", {
    preMB: preBytes === null ? null : Math.round(preBytes / 1024 ** 2),
    postMB: postBytes === null ? null : Math.round(postBytes / 1024 ** 2),
    capGB: Math.round(CAP_BYTES / 1024 ** 3),
    posnetkiNapaka: posnetki.error?.message ?? null,
    dogodkiNapaka: dogodki.error?.message ?? null,
    oglasiNapaka: oglasi.error?.message ?? null,
    zadnjeOknoPosnetkovDni: okno,
    naCapu: postBytes !== null && postBytes > CAP_BYTES,
  });
}
