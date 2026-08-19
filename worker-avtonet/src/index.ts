import "dotenv/config";
import { BlockedError } from "./collector.js";
import { connect, reportHealth, type Db } from "./db.js";
import {
  current,
  dovoljenoCakanjeMs,
  mirovanjeDelaMs,
  napredek,
  premik,
  startHealthServer,
  update,
  type WorkerState,
} from "./health.js";
import { buildDailyReport, sendDailyReport } from "./report.js";
import {
  claimResearch,
  finishResearch,
  oziviPoBlokadi,
  requestResearch,
  saveProgress,
  type Job,
} from "./jobs.js";
import { runResearch, type Progress } from "./research.js";
import { pociistiStareVnose } from "./retention.js";
import { poveziVozila } from "./vozila.js";
import { izracunajStatistiko } from "./statistika.js";
import { normalizirajIdentitete } from "./normalizacija.js";
import { izracunajPosle } from "./dealfeed2.js";
import { blokiran, minutDoKonca, preberiBlokado, zabelezBlokado, zabelezUspeh } from "./blokada.js";
import { samopopravilo } from "./samopopravilo.js";

/**
 * SBN Auto collector — the long-running production process.
 *
 * One loop, one path. The worker polls for research requests and runs them with
 * the adaptive-slicing collector; the dashboard button creates a request, and —
 * with AVTONET_URNIK=1 — a timer creates the same request at fixed hours. The
 * schedule is a clock that presses the button, nothing more, so there is exactly
 * one code path to trust and the old un-sliced sweep (capped at 1,000 by the
 * source) is gone.
 *
 * The hours are chosen around a person's day, not the machine's: a run before
 * work so the morning coffee shows what appeared overnight, one finishing around
 * noon so a new car can still be called about the same day, and one at night.
 *
 * Failures are counted, never hidden: past a threshold the worker enters a
 * visible `ustavljeno` state and backs off, instead of crashing so the platform
 * restarts it into the same wall every minute.
 */

const PORT = Number(process.env.PORT ?? 8080);
const FAILURES_BEFORE_STOP = Number(process.env.AVTONET_MAX_FAILURES ?? 5);
/** How often to look for a research requested from the dashboard. */
const POLL_MS = Number(process.env.AVTONET_POLL_MS ?? 15_000);
/** Timed sweeps. Off = the manual button is the only trigger. */
const URNIK = /^(1|true|da|yes)$/i.test(process.env.AVTONET_URNIK ?? "");

/**
 * Hours at which a sweep STARTS. A full listing sweep takes roughly two hours,
 * so the defaults are set two hours before the moments that matter: 5 → done by
 * ~7, read at 8 on the way to work; 10 → done by ~12, time to phone a seller
 * the same day; 22 → the night pass.
 */
function researchHours(): number[] {
  const raw = (process.env.AVTONET_RESEARCH_HOURS ?? "5,10,22").trim();
  const hours = raw
    .split(",")
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return hours.length > 0 ? [...new Set(hours)].sort((a, b) => a - b) : [5, 10, 22];
}

function razcleniUre(raw: string): number[] {
  const hours = raw
    .split(/[,\s]+/)
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return hours.length > 0 ? [...new Set(hours)].sort((a, b) => a - b) : [];
}

/**
 * The schedule, read from the database so the dashboard is the single source of
 * truth: a change to the hours or the on/off switch takes effect within one poll
 * with no redeploy. If the table is missing (migration not run) this returns
 * null and the caller falls back to the AVTONET_URNIK / AVTONET_RESEARCH_HOURS
 * env vars — so nothing about the old behaviour changes until the table exists.
 */
async function beriUrnik(db: Db): Promise<{ omogocen: boolean; hours: number[] } | null> {
  try {
    const { data, error } = await db
      .from("avtonet_urnik")
      .select("omogocen, ure")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { omogocen: boolean; ure: string };
    const hours = razcleniUre(String(row.ure ?? ""));
    return { omogocen: Boolean(row.omogocen), hours: hours.length ? hours : researchHours() };
  } catch {
    return null;
  }
}

function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl: level, msg, ...extra }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** The next moment the schedule should press the button. */
function naslednjiTermin(hours: number[]): Date {
  const now = new Date();
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const h of hours) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + dayOffset);
      candidate.setHours(h, 0, 0, 0);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return new Date(now.getTime() + 6 * 60 * 60_000);
}

/**
 * Set when the platform asks us to stop. The research reads it at every page
 * boundary and returns, leaving the job row as `tece` with its slices recorded —
 * so a redeploy costs at most one slice, and the next worker resumes there.
 */
let stopping = false;

/**
 * The stall guard: the last time this process made any visible progress.
 *
 * On 16.08 the collector hung inside a browser call for ninety minutes — alive,
 * holding its port, logging nothing, reporting no error. Every retry and backoff
 * in this worker assumes a call eventually returns; none of them fires when the
 * process simply stops. So progress is stamped here, and a timer that runs
 * outside all of that work checks the stamp: no movement for the budget means
 * the process is wedged, and the honest response is to die so the wrapper
 * script can start a healthy one. Since the restart reclaims the running
 * research immediately, that costs seconds, not a run.
 */
const ZASTOJ_MS = Number(process.env.AVTONET_STALL_MS ?? 12 * 60_000);

/**
 * Whether a research is being worked on right now.
 *
 * An idle worker between runs does no work by definition, and killing it for
 * that would be a restart loop. Only a running job can stall.
 */
let deloVTeku = false;
function jeDeloVTeku(): boolean {
  return deloVTeku;
}

function zazeniNadzorZastoja(db: Db): void {
  const t = setInterval(() => {
    // WORK, not liveness. The first version watched the liveness stamp, which a
    // collector spinning in a wait loop keeps perfectly fresh — so it watched
    // the one number that cannot go stale in the failure it exists to catch.
    const mirujeMs = mirovanjeDelaMs();
    if (mirujeMs < ZASTOJ_MS) return;
    // A declared pause is still allowed to be quiet — but only until it ends.
    if (dovoljenoCakanjeMs() > 0) return;
    if (!jeDeloVTeku()) return;
    clearInterval(t);
    const minut = Math.round(mirujeMs / 60_000);
    log("error", "ZASTOJ - nic obdelanega, koncujem, da se lahko zazene znova", {
      mirovanjeMin: minut,
      opomba: "raziskava ostane 'tece' in jo nova instanca prevzame takoj",
    });
    // Diagnose first, then die: the evidence (log tail, guard state, queue) is
    // only available from inside this process's own world, and after the restart
    // the console should say WHAT happened, not just that something did.
    void samopopravilo(db, `Zastoj: ${minut} min brez enega samega obdelanega oglasa`, log)
      .then(() =>
        reportHealth(db, {
          heartbeat: new Date().toISOString(),
          stanje: "napaka",
          zadnja_napaka: `Zastoj: ${minut} min brez napredka — zbiralnik se je sam ponovno zagnal`,
        })
      )
      .finally(() => process.exit(1));
    // If the diagnosis itself hangs, leave anyway — restarting beats waiting.
    setTimeout(() => process.exit(1), 90_000).unref();
  }, 60_000);
  t.unref();
}

/**
 * Runs one research requested from the dashboard or the schedule, reporting
 * into its row.
 *
 * The two ways this can end other than finishing are both normal outcomes: the
 * user cancels (the progress write finds no row of ours), or the source pushes
 * back past the backoff budget (recorded as an error, slices intact, so a later
 * attempt continues instead of starting the hours again).
 */
async function runJob(db: Db, job: Job): Promise<void> {
  deloVTeku = true;
  premik();
  const startedAt = new Date().toISOString();
  update({ lastRunAt: startedAt });
  await reportHealth(db, { zadnji_zagon: startedAt, heartbeat: startedAt, stanje: "ok" });
  log("info", job.nadaljevanje ? "nadaljujem raziskavo" : "zacenjam raziskavo", {
    raziskava: job.id,
  });

  let cancelled = false;
  let progress: Progress | null = null;

  try {
    progress = await runResearch(db, {
      // Resume is by slice: runResearch reads which slices are already recorded
      // for this research and skips them.
      raziskavaId: job.id,
      log,
      shouldStop: () => cancelled || stopping,
      onProgress: async (p) => {
        // A written progress row is real work — phase 1 reports one per results
        // page, and without this the work clock would run dry during a perfectly
        // healthy market sweep.
        napredek();
        if (!(await saveProgress(db, job.id, p))) {
          cancelled = true;
          log("warn", "raziskava je bila preklicana", { raziskava: job.id });
        }
        await reportHealth(db, { heartbeat: new Date().toISOString(), strani_zadnjic: p.zadnja_stran });
      },
    });

    if (cancelled) {
      // The status is already whatever the user set; finishing is guarded on
      // `tece`, so this call simply does nothing and their decision stands.
      await finishResearch(db, job.id, "preklicano", progress);
    } else if (stopping) {
      log("warn", "raziskava prekinjena zaradi zaustavitve - ostane za nadaljevanje", {
        raziskava: job.id,
      });
      return; // Left as `tece`: the next worker picks it up where it stood.
    } else {
      await finishResearch(db, job.id, "koncano", progress);
      // A clean finish forgets any block and hands some speed back.
      await zabelezUspeh(db);
      update({
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        consecutiveFailures: 0,
        state: "ok",
        lastPages: progress.strani_pregledanih,
        lastFound: progress.oglasov_najdenih,
        lastNew: progress.novih,
      });
      await reportHealth(db, {
        zadnji_uspeh: new Date().toISOString(),
        heartbeat: new Date().toISOString(),
        zadnja_napaka: null,
        zaporednih_napak: 0,
        stanje: "ok",
        strani_zadnjic: progress.strani_pregledanih,
        najdenih_zadnjic: progress.oglasov_najdenih,
        novih_zadnjic: progress.novih,
      });
      log("info", "raziskava koncana", {
        raziskava: job.id,
        poizvedb: progress.poizvedb_koncanih,
        strani: progress.strani_pregledanih,
        oglasov: progress.oglasov_najdenih,
        novih: progress.novih,
        detajlov: progress.detajlov_obdelanih,
        napak: progress.napak,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const blocked = err instanceof BlockedError;
    const failures = current().consecutiveFailures + 1;
    const state: WorkerState = failures >= FAILURES_BEFORE_STOP ? "ustavljeno" : "opozorilo";

    update({ lastError: message, consecutiveFailures: failures, state });
    await finishResearch(db, job.id, "napaka", progress, message);
    // A 403/429 is the source telling us to go away. Park collecting for hours
    // (longer each time) instead of letting the schedule walk straight back in.
    if (blocked) {
      const b = await zabelezBlokado(db, "Vir je vrnil 403");
      log("warn", "vir blokira - zbiranje pocakalo", {
        do: b.do,
        stopnja: b.stopnja,
        faktor: b.faktor,
      });
    }
    await reportHealth(db, {
      zadnja_napaka: message,
      zaporednih_napak: failures,
      stanje: state,
      heartbeat: new Date().toISOString(),
    });
    log(blocked ? "warn" : "error", blocked ? "vir je zavrnil zahtevek" : "napaka med raziskavo", {
      raziskava: job.id,
      napaka: message,
      zaporednihNapak: failures,
      stanje: state,
    });

    // Let the diagnosis look at a real failure too, not only at a stall.
    if (!blocked) await samopopravilo(db, `Raziskava se je ustavila z napako: ${message}`, log);
  } finally {
    deloVTeku = false;
    premik();
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const hours = researchHours();

  // The health server comes up FIRST, before anything can go wrong, so that a
  // broken start can explain itself. 503 + reason instead of a silent exit.
  const server = once ? null : startHealthServer(PORT);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const razlog =
      "Manjkata SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY. Vpisite ju med spremenljivke okolja (Railway: Variables).";
    update({ state: "ustavljeno", lastError: razlog });
    log("error", razlog);
    if (once) process.exit(1);
    // Stay up so the reason remains readable; the 503 keeps the platform honest.
    return;
  }

  const db = connect();
  if (!once) zazeniNadzorZastoja(db);
  log("info", "zbiralnik zagnan", {
    nacin: URNIK ? "urnik + rocne zahteve" : "caka na rocne zahteve",
    urnikOb: URNIK ? hours : "izklopljen",
  });

  // A stop request does not kill a running sweep outright: the flag lets it
  // finish the page it is on and leave usable slice records. The hard exit after
  // a grace period is there because the platform will kill us anyway.
  const shutdown = () => {
    if (stopping) process.exit(0);
    stopping = true;
    log("info", "zaustavljam - koncujem tekoco stran");
    setTimeout(() => {
      server?.close();
      process.exit(0);
    }, 20_000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // The daily report runs once per calendar day, after a research. Its failure
  // never touches the collector.
  let lastReportDay: string | null = null;
  const maybeSendReport = async (): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    if (lastReportDay === today) return;
    try {
      const report = await buildDailyReport(db);
      // One mail, and the day's budget lives in the database — see posta.ts.
      // This used to be an in-memory day marker, so every restart re-sent it.
      const outcome = await sendDailyReport(db, report);
      lastReportDay = today;
      log("info", "dnevno porocilo", {
        datum: report.datum,
        novih: report.novihOglasov,
        aktivnih: report.aktivnih,
        izginilih: report.izginilih,
        posiljanje: outcome,
      });
    } catch (err) {
      log("warn", "dnevnega porocila ni bilo mogoce sestaviti", {
        napaka: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Same-vehicle linking runs after every research: new adverts are matched
  // against recently finished ones, so a relist stops counting as a sale.
  const maybeLinkVehicles = async (): Promise<void> => {
    try {
      await poveziVozila(db, log);
    } catch (err) {
      log("warn", "povezovanje vozil ni uspelo", { napaka: err instanceof Error ? err.message : String(err) });
    }
  };

  // All aggregates the pages show, recomputed after every research (and after
  // linking, so relists are already excluded).
  //
  // The Deal Feed no longer has an email of its own: it is a section inside the
  // daily report, because the numbers and the opportunities are read in the same
  // minute and two mails for one market is one too many.
  const maybeStatistika = async (): Promise<void> => {
    try {
      await izracunajStatistiko(db, log);
    } catch (err) {
      log("warn", "statistika ni uspela", { napaka: err instanceof Error ? err.message : String(err) });
    }
    // Identiteta vozil za nove oglase, nato posli 2.0 nad njo. Oboje bere samo
    // lastno bazo, zato ne more povzrociti blokade pri viru; posli 2.0 pisejo
    // deal_feed za statistiko in s tem povozijo staro razlicico.
    try {
      const izid = await normalizirajIdentitete(db);
      if (izid.obdelanih > 0) {
        log("info", "identiteta normalizirana", { oglasov: izid.obdelanih, zaupanje: izid.povprecnoZaupanje });
      }
    } catch (err) {
      log("warn", "normalizacija ni uspela", { napaka: err instanceof Error ? err.message : String(err) });
    }
    try {
      await izracunajPosle(db, log);
    } catch (err) {
      log("warn", "posli 2.0 niso uspeli", { napaka: err instanceof Error ? err.message : String(err) });
    }
  };

  // Retention runs once per calendar day too: prune the oldest snapshots, log
  // events and finished adverts so the local DB stays bounded (see retention.ts).
  let lastPruneDay: string | null = null;
  const maybePrune = async (): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    if (lastPruneDay === today) return;
    lastPruneDay = today;
    try {
      await pociistiStareVnose(db, log);
    } catch (err) {
      log("warn", "retention ni uspel", { napaka: err instanceof Error ? err.message : String(err) });
    }
  };

  // --once: queue one research, run it, exit. For tests and cron-style hosts.
  if (once) {
    await requestResearch(db);
    const job = await claimResearch(db);
    if (job) await runJob(db, job);
    await maybeLinkVehicles();
    await maybeStatistika();
    await maybeSendReport();
    await maybePrune();
    return;
  }

  // The single loop: the schedule presses the button, the poll picks it up.
  // Both go through the identical claim/run path the dashboard uses, so there
  // is no second sweep implementation to drift out of date.
  //
  // The schedule is re-read from the database every loop (with the env vars as
  // fallback), so enabling it, disabling it or changing the hours from the
  // dashboard takes effect within one poll — no redeploy, no restart.
  let urnikKljuc = "";
  let termin: Date | null = null;
  // Only the first poll may reclaim this machine's own interrupted research.
  let prviKrog = true;

  const osveziUrnik = async (): Promise<number[]> => {
    const iz = await beriUrnik(db);
    const omogocen = iz ? iz.omogocen : URNIK;
    const ure = iz ? iz.hours : hours;
    const kljuc = `${omogocen}:${ure.join(",")}`;
    if (kljuc !== urnikKljuc) {
      urnikKljuc = kljuc;
      termin = omogocen ? naslednjiTermin(ure) : null;
      log("info", "urnik", { vir: iz ? "baza" : "env", omogocen, ure, naslednji: termin?.toISOString() ?? null });
    }
    return ure;
  };

  await osveziUrnik();

  while (!stopping) {
    const ure = await osveziUrnik();
    if (termin && Date.now() >= termin.getTime()) {
      // Never walk into an active block: each attempt makes the next block
      // arrive sooner (measured: 631 -> 953 -> 31 pages before the 403).
      const bl = await preberiBlokado(db);
      if (blokiran(bl)) {
        log("warn", "termin preskocen - vir blokira", { se: minutDoKonca(bl) + " min", stopnja: bl.stopnja });
        termin = naslednjiTermin(ure);
        await sleep(POLL_MS);
        continue;
      }
      const out = await requestResearch(db);
      if ("zeTece" in out) {
        // A research is still running from earlier (the first full fill can
        // outlast a slot). Skipping is correct: the unique index guarantees one
        // active research, and the next slot will try again.
        log("warn", "termin preskocen - raziskava ze tece");
      } else {
        log("info", "urnik: raziskava dana v vrsto", { raziskava: out.id });
      }
      termin = naslednjiTermin(ure);
      log("info", "naslednji termin urnika", { ob: termin.toISOString() });
    }

    let job: Job | null = null;
    try {
      const bl = await preberiBlokado(db);
      if (!blokiran(bl)) {
        // A block ended: pick the interrupted sweep back up instead of waiting
        // for the next scheduled hour. Continues from its recorded slices, so it
        // costs the pages that are actually missing.
        const ozivljena = await oziviPoBlokadi(db);
        if (ozivljena) {
          log("info", "blokada je minila - nadaljujem prekinjeno raziskavo", { raziskava: ozivljena });
        }
      }
      if (blokiran(bl)) {
        // A queued request (e.g. the dashboard button) waits out the block
        // rather than burning it — the row stays, so it starts by itself after.
        await reportHealth(db, { heartbeat: new Date().toISOString(), stanje: "opozorilo",
          zadnja_napaka: `Vir blokira — zbiranje počiva še ${minutDoKonca(bl)} min` });
        await sleep(POLL_MS);
        continue;
      }
      // First pass after startup takes back a research this machine was running
      // when it stopped, without waiting out the stale window.
      job = await claimResearch(db, prviKrog);
      prviKrog = false;
    } catch (err) {
      // Not being able to READ the queue is a database problem, not a
      // collecting problem: it must not trigger the failure back-off that
      // exists for the source pushing back.
      log("warn", "vrste zahtev ni bilo mogoce prebrati", {
        napaka: err instanceof Error ? err.message : String(err),
      });
      await reportHealth(db, { heartbeat: new Date().toISOString() });
    }

    if (job) {
      await runJob(db, job);
      await maybeLinkVehicles();
      // Statistics first: the report carries the deals the statistics step
      // scored, so the other order would mail yesterday's list.
      await maybeStatistika();
      await maybeSendReport();
      await maybePrune();
      continue; // Another request may already be waiting.
    }

    // An idle worker is not a stalled one: with no research to work on there is
    // no work to measure, so the poll counts as both. Without this the external
    // watchdog would read a growing "work age" on a perfectly healthy worker
    // that simply has nothing to do, and restart it every twenty minutes.
    napredek();
    await reportHealth(db, { heartbeat: new Date().toISOString() });
    await sleep(POLL_MS);
  }
  server?.close();
}

main().catch((err) => {
  log("error", "zbiralnik je padel", { napaka: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
