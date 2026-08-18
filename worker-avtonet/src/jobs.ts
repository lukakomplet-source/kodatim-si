import type { Db } from "./db.js";
import type { Progress } from "./research.js";

/**
 * The order queue between the web app and the worker.
 *
 * The button on /avtonet cannot run the research itself: Vercel has no browser
 * and stops a function after minutes, while a sweep takes hours. So the click
 * writes one row, and this file is how the worker picks it up, reports into it,
 * and closes it. That single row is order, progress meter and checkpoint at
 * once, which is why the dashboard needs no separate channel to watch a run.
 */

/**
 * A `tece` row untouched for this long belonged to a worker that died. Read per
 * call rather than at module load, so a test can shorten it in-process.
 */
function staleAfterMs(): number {
  const raw = process.env.AVTONET_STALE_AFTER_MS;
  return raw === undefined || raw === "" ? 15 * 60_000 : Number(raw);
}

export type Job = {
  id: string;
  faza: number;
  zadnja_stran: number;
  zahtevano_ob: string;
  nadaljevanje: boolean;
};

type Row = {
  id: string;
  faza: number | null;
  zadnja_stran: number | null;
  zahtevano_ob: string;
};

function toJob(row: Row, nadaljevanje: boolean): Job {
  return {
    id: row.id,
    faza: row.faza ?? 1,
    zadnja_stran: row.zadnja_stran ?? 0,
    zahtevano_ob: row.zahtevano_ob,
    nadaljevanje,
  };
}

/**
 * Takes ownership of the next research, if there is one.
 *
 * Two cases, in this order. A row still marked `tece` but silent for a quarter
 * of an hour is the wreckage of a worker that was killed mid-sweep — it is
 * resumed from its checkpoint, because the alternative is a run that can never
 * finish and a unique index that blocks every new request behind it. Otherwise
 * a freshly requested row is started from page one.
 *
 * The claim is the `update ... where status = <expected>` itself, not a read
 * followed by a write: two workers racing for the same row means exactly one
 * update matches and the loser gets no row back.
 */
/**
 * @param takoj  Take over a running research regardless of how recently it was
 *   written. Only the first pass after startup may do this: the collector binds
 *   port 8080 as a mutex, so reaching this point proves no other worker is
 *   alive on this machine, and the fifteen-minute wait would otherwise be a
 *   dead zone after every restart or crash — the row says `tece`, nobody is
 *   working it, and the console shows a run that has stopped moving.
 */
export async function claimResearch(db: Db, takoj = false): Promise<Job | null> {
  const cutoff = new Date(takoj ? Date.now() + 1000 : Date.now() - staleAfterMs()).toISOString();

  const { data: stale } = await db
    .from("avtonet_raziskave")
    .select("id, faza, zadnja_stran, zahtevano_ob")
    .eq("status", "tece")
    .lt("updated_at", cutoff)
    .order("zahtevano_ob", { ascending: true })
    .limit(1);

  if (stale && stale.length > 0) {
    const { data } = await db
      .from("avtonet_raziskave")
      .update({ status: "tece" })
      .eq("id", stale[0].id)
      .eq("status", "tece")
      .lt("updated_at", cutoff)
      .select("id, faza, zadnja_stran, zahtevano_ob")
      .maybeSingle();
    if (data) return toJob(data as Row, true);
  }

  const { data: waiting } = await db
    .from("avtonet_raziskave")
    .select("id, faza, zadnja_stran, zahtevano_ob")
    .eq("status", "zahtevano")
    .order("zahtevano_ob", { ascending: true })
    .limit(1);

  if (!waiting || waiting.length === 0) return null;

  const { data } = await db
    .from("avtonet_raziskave")
    .update({ status: "tece", zacetek: new Date().toISOString(), zadnja_napaka: null })
    .eq("id", waiting[0].id)
    .eq("status", "zahtevano")
    .select("id, faza, zadnja_stran, zahtevano_ob")
    .maybeSingle();

  return data ? toJob(data as Row, false) : null;
}

/**
 * Writes the current counters into the job row.
 *
 * Returns false when the row is no longer ours — which is how cancellation
 * arrives. "Prekliči" in the dashboard simply sets the status; the next progress
 * write finds nothing to update and the run stops at the next page boundary.
 * One round trip serves as both report and permission check, so a cancelled run
 * never keeps hitting the source while the screen says it stopped.
 *
 * Never throws. A momentary database hiccup must not destroy hours of
 * collecting — the sweep continues and the next write catches up.
 */
export async function saveProgress(db: Db, id: string, p: Progress): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("avtonet_raziskave")
      .update({
        faza: p.faza,
        strani_pregledanih: p.strani_pregledanih,
        oglasov_najdenih: p.oglasov_najdenih,
        novih: p.novih,
        posodobljenih: p.posodobljenih,
        spremembe_cen: p.spremembe_cen,
        izginulih: p.izginulih,
        detajlov_obdelanih: p.detajlov_obdelanih,
        detajlov_skupaj: p.detajlov_skupaj,
        detajlov_v_vrsti: p.detajlov_v_vrsti,
        napak: p.napak,
        poizvedb_koncanih: p.poizvedb_koncanih,
        poizvedb_razdeljenih: p.poizvedb_razdeljenih,
        poizvedb_skupaj: p.poizvedb_skupaj,
        trenutna_rezina: p.trenutna_rezina,
        zadnja_stran: p.zadnja_stran,
        pregled_popoln: p.pregled_popoln,
        zadnja_napaka: p.zadnja_napaka,
      })
      .eq("id", id)
      .eq("status", "tece")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(`[raziskava] zapis napredka ni uspel: ${error.message}`);
      return true;
    }
    return data !== null;
  } catch (err) {
    console.error(`[raziskava] zapis napredka ni uspel: ${err instanceof Error ? err.message : err}`);
    return true;
  }
}

/**
 * Closes the job.
 *
 * Guarded on `tece` so a finish cannot overwrite a cancellation the user made
 * seconds earlier — their decision stays visible instead of being replaced by
 * "koncano". The checkpoint is left as it is: a run that ended in an error can
 * then be resumed rather than repeated.
 */
export async function finishResearch(
  db: Db,
  id: string,
  status: "koncano" | "napaka" | "preklicano",
  p: Progress | null,
  napaka?: string
): Promise<void> {
  const patch: Record<string, unknown> = { status, konec: new Date().toISOString() };
  if (napaka !== undefined) patch.zadnja_napaka = napaka;
  if (p) {
    patch.faza = p.faza;
    patch.strani_pregledanih = p.strani_pregledanih;
    patch.oglasov_najdenih = p.oglasov_najdenih;
    patch.novih = p.novih;
    patch.posodobljenih = p.posodobljenih;
    patch.spremembe_cen = p.spremembe_cen;
    patch.izginulih = p.izginulih;
    patch.detajlov_obdelanih = p.detajlov_obdelanih;
    patch.detajlov_skupaj = p.detajlov_skupaj;
    patch.detajlov_v_vrsti = p.detajlov_v_vrsti;
    patch.napak = p.napak;
    patch.poizvedb_koncanih = p.poizvedb_koncanih;
    patch.poizvedb_razdeljenih = p.poizvedb_razdeljenih;
    patch.poizvedb_skupaj = p.poizvedb_skupaj;
    patch.trenutna_rezina = p.trenutna_rezina;
    patch.zadnja_stran = p.zadnja_stran;
    patch.pregled_popoln = p.pregled_popoln;
  }

  const { error } = await db.from("avtonet_raziskave").update(patch).eq("id", id).eq("status", "tece");
  if (error) console.error(`[raziskava] zakljucek ni bil zapisan: ${error.message}`);
}

/**
 * Requests a research from the worker side (tests, CLI).
 *
 * A conflict on the unique index is not an error worth throwing: it means a
 * research is already queued or running, which is the exact state the index
 * exists to guarantee.
 */
export async function requestResearch(db: Db): Promise<{ id: string } | { zeTece: true }> {
  const { data, error } = await db
    .from("avtonet_raziskave")
    .insert({ status: "zahtevano" })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { zeTece: true };
    throw new Error(`Zahteve za raziskavo ni bilo mogoce ustvariti: ${error.message}`);
  }
  return { id: (data as { id: string }).id };
}

/**
 * Brings a research that a block interrupted back to life, once the block has
 * lifted.
 *
 * Without this the morning is simply lost: the 06:00 sweep on 18.08 hit a 403
 * after 361 pages, the block memory correctly parked collecting for two hours —
 * and then nothing happened until the 18:00 slot, because a failed research is
 * not retried and the schedule only fires on the hour it was given. The market
 * went unmeasured for a day for want of a retry.
 *
 * Revived rather than replaced: the row keeps its recorded slices, so the sweep
 * CONTINUES from where it stopped instead of paying for 361 pages again. A new
 * request would start from nothing.
 *
 * @returns the id it revived, or null when there was nothing to revive.
 */
export async function oziviPoBlokadi(db: Db): Promise<string | null> {
  // Never while something is already queued or running: that is the invariant
  // the unique index protects, and stepping on it would mean two sweeps.
  const { data: aktivne } = await db
    .from("avtonet_raziskave")
    .select("id")
    .in("status", ["zahtevano", "tece"])
    .limit(1);
  if (aktivne && aktivne.length > 0) return null;

  // Only a recent failure, and only one the source caused. An old failure or a
  // parser bug must not be retried in a loop — that is what the block memory and
  // the self-repair are for.
  const odKdaj = new Date(Date.now() - 18 * 3_600_000).toISOString();
  const { data } = await db
    .from("avtonet_raziskave")
    .select("id, zadnja_napaka, konec, strani_pregledanih")
    .eq("status", "napaka")
    .gte("konec", odKdaj)
    .order("konec", { ascending: false })
    .limit(1);

  const vrstica = (data ?? [])[0] as
    | { id: string; zadnja_napaka: string | null; strani_pregledanih: number }
    | undefined;
  if (!vrstica) return null;
  if (!/403|429|blokir/i.test(vrstica.zadnja_napaka ?? "")) return null;

  const { data: ozivljena } = await db
    .from("avtonet_raziskave")
    .update({ status: "zahtevano", zadnja_napaka: null, konec: null })
    .eq("id", vrstica.id)
    .eq("status", "napaka")
    .select("id")
    .maybeSingle();

  return (ozivljena as { id: string } | null)?.id ?? null;
}
