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
export async function claimResearch(db: Db): Promise<Job | null> {
  const cutoff = new Date(Date.now() - staleAfterMs()).toISOString();

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
