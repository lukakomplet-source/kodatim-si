import "dotenv/config";
import { BlockedError, collectAll, openBrowser } from "./collector.js";
import { connect, markDisappeared, reportHealth, upsertListings, type Db } from "./db.js";
import { current, startHealthServer, update, type WorkerState } from "./health.js";
import { buildDailyReport, sendDailyReport } from "./report.js";
import { runSavedSearches } from "./alerts.js";
import { claimResearch, finishResearch, saveProgress, type Job } from "./jobs.js";
import { runResearch, type Progress } from "./research.js";

/**
 * SBN Auto collector — the long-running production process.
 *
 * The shape of the job decided the shape of the program. This is not a monitor
 * that pokes the site every minute; it is a full sweep of the market, started
 * by hand from the dashboard. One sweep walks every page of passenger-car
 * results, opens each advert's own page, updates what it already knows, records
 * what is new, and appends a snapshot for each — so the value accumulates as
 * history rather than as a fresh photograph each hour.
 *
 * The default mode is therefore to WAIT: the worker polls for a research
 * requested from the web app and runs it. Nothing happens on its own until the
 * manual path is proven end to end; the timed schedule still exists but only
 * switches on with AVTONET_URNIK=1.
 *
 * That pace is also what makes politeness free. avto.net's robots.txt permits
 * everything and asks for a ten-second crawl delay; the whole market is roughly
 * 1,100 result pages, so a sweep takes hours and the requested pace never has
 * to be argued with.
 *
 * Failures are counted, never hidden: past a threshold the worker enters a
 * visible `ustavljeno` state and backs off, instead of crashing so the
 * platform restarts it into the same wall every minute.
 */

const PORT = Number(process.env.PORT ?? 8080);
const FAILURES_BEFORE_STOP = Number(process.env.AVTONET_MAX_FAILURES ?? 5);
/** 0 = the whole market. A small number is for testing. */
const MAX_PAGES = Number(process.env.AVTONET_MAX_PAGES ?? 0);
/** How often to look for a research requested from the dashboard. */
const POLL_MS = Number(process.env.AVTONET_POLL_MS ?? 15_000);
/** Timed sweeps, off by default: the manual button is the only trigger for now. */
const URNIK = /^(1|true|da|yes)$/i.test(process.env.AVTONET_URNIK ?? "");

/** Hours of the day at which a sweep starts, e.g. "6,18" for twice daily. */
function researchHours(): number[] {
  const raw = (process.env.AVTONET_RESEARCH_HOURS ?? "6,18").trim();
  const hours = raw
    .split(",")
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return hours.length > 0 ? [...new Set(hours)].sort((a, b) => a - b) : [6, 18];
}

/**
 * Brands to sweep, or empty for the entire passenger-car market.
 *
 * Empty is the intended production setting: one unfiltered sweep is both
 * fewer requests and more complete than looping brand by brand, because a
 * brand list can only ever be a guess at what matters.
 */
function brands(): string[] {
  const raw = (process.env.AVTONET_ZNAMKE ?? "").trim();
  return raw ? raw.split(",").map((b) => b.trim()).filter(Boolean) : [];
}

function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl: level, msg, ...extra }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOnce(): Promise<void> {
  const db = connect();
  const startedAt = new Date().toISOString();
  update({ lastRunAt: startedAt });
  await reportHealth(db, { zadnji_zagon: startedAt, heartbeat: startedAt });

  const browser = await openBrowser();
  let found = 0;
  let fresh = 0;
  let pages = 0;

  try {
    // No brand filter means one sweep of everything; a brand list means one
    // sweep per brand. Both end in the same place.
    const targets = brands().length > 0 ? brands().map((z) => ({ znamka: z })) : [{}];

    for (const target of targets) {
      const label = "znamka" in target ? (target as { znamka: string }).znamka : "vsa osebna vozila";
      log("info", "zacenjam pregled", { cilj: label });

      const { rows, pages: strani, complete } = await collectAll(browser, target, MAX_PAGES, (info) => {
        // A sweep runs for hours; without this the logs are silent the whole
        // time and a stuck run is indistinguishable from a slow one.
        if (info.page % 10 === 0) {
          log("info", "napredek", { cilj: label, stran: info.page, skupaj: info.total });
          void reportHealth(db, { heartbeat: new Date().toISOString(), strani_zadnjic: info.page });
        }
      });

      pages += strani;
      found += rows.length;
      log("info", "prebrano", { cilj: label, strani, oglasov: rows.length });

      const outcome = await upsertListings(db, rows);
      fresh += outcome.novi.length;
      log("info", "zapisano", {
        cilj: label,
        novih: outcome.novi.length,
        spremembCene: outcome.spremembeCene.length,
      });

      // Absence is only evidence when the sweep actually reached the end of
      // the listings. A run cut short by the page limit — or by anything else
      // — has not seen most of the market, so treating "not seen" as "gone"
      // would write thousands of false disappearances into the history and
      // quietly ruin the time-on-market statistics this whole system exists
      // for. Caught on a real run: a 3-page sweep marked 26 healthy BMW ads
      // as vanished.
      if (!complete) {
        log("warn", "pregled ni bil popoln - izginotja se ne belezijo", { cilj: label, strani });
      } else {
        let scopeQuery = db.from("avtonet_oglasi").select("avtonet_id").eq("status", "aktiven");
        if ("znamka" in target) scopeQuery = scopeQuery.eq("znamka", (target as { znamka: string }).znamka);
        const { data: scope } = await scopeQuery;

        const gone = await markDisappeared(
          db,
          rows.map((r) => r.avtonetId),
          (scope ?? []).map((s) => s.avtonet_id as string)
        );
        if (gone > 0) log("info", "izginuli oglasi", { cilj: label, izginilo: gone });
      }
    }

    // The second use of the same data: does anything new match a saved search?
    try {
      for (const o of await runSavedSearches(db)) {
        log("info", "shranjeno iskanje", { ...o });
      }
    } catch (err) {
      log("warn", "shranjenih iskanj ni bilo mogoce obdelati", {
        napaka: err instanceof Error ? err.message : String(err),
      });
    }

    const finishedAt = new Date().toISOString();
    update({
      lastSuccessAt: finishedAt,
      lastError: null,
      consecutiveFailures: 0,
      state: "ok",
      lastPages: pages,
      lastFound: found,
      lastNew: fresh,
    });
    await reportHealth(db, {
      zadnji_uspeh: finishedAt,
      heartbeat: finishedAt,
      zadnja_napaka: null,
      zaporednih_napak: 0,
      stanje: "ok",
      strani_zadnjic: pages,
      najdenih_zadnjic: found,
      novih_zadnjic: fresh,
    });
    log("info", "pregled koncan", { oglasov: found, novih: fresh, strani: pages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const blocked = err instanceof BlockedError;

    const failures = current().consecutiveFailures + 1;
    const state: WorkerState = failures >= FAILURES_BEFORE_STOP ? "ustavljeno" : "opozorilo";
    update({ lastError: message, consecutiveFailures: failures, state });
    await reportHealth(db, {
      zadnja_napaka: message,
      zaporednih_napak: failures,
      stanje: state,
      heartbeat: new Date().toISOString(),
    });

    // A block is the source saying stop, not a crash to fight.
    log(blocked ? "warn" : "error", blocked ? "vir je zavrnil zahtevek" : "napaka med pregledom", {
      napaka: message,
      zaporednihNapak: failures,
      stanje: state,
    });
  } finally {
    await browser.close();
  }
}

/**
 * Set when the platform asks us to stop. The research reads it at every page
 * boundary and returns, leaving the job row as `tece` with its checkpoint — so
 * a redeploy costs one page, and the next worker resumes where this one stood.
 */
let stopping = false;

/**
 * Runs one research requested from the dashboard, reporting into its row.
 *
 * The two ways this can end other than finishing are both handled as normal
 * outcomes rather than crashes: the user cancels (detected by the progress write
 * finding no row of ours), or the source pushes back with 403/429 (recorded as
 * an error, with the checkpoint intact so a later attempt continues instead of
 * starting the hours again).
 */
async function runJob(db: Db, job: Job): Promise<void> {
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
      // Resume is by slice now, not by page: runResearch reads which slices are
      // already recorded for this research and skips them, so a re-claimed job
      // continues at the next unfinished slice on its own.
      raziskavaId: job.id,
      log,
      shouldStop: () => cancelled || stopping,
      onProgress: async (p) => {
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
        zadnjaStran: progress.zadnja_stran,
      });
      return; // Left as `tece`: the next worker picks it up from the checkpoint.
    } else {
      await finishResearch(db, job.id, "koncano", progress);
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
  }
}

/** Milliseconds until the next scheduled hour. */
function msUntilNextRun(hours: number[]): { ms: number; at: Date } {
  const now = new Date();
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const h of hours) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + dayOffset);
      candidate.setHours(h, 0, 0, 0);
      if (candidate.getTime() > now.getTime()) {
        return { ms: candidate.getTime() - now.getTime(), at: candidate };
      }
    }
  }
  const fallback = new Date(now.getTime() + 6 * 60 * 60_000);
  return { ms: 6 * 60 * 60_000, at: fallback };
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const runNow = once || process.argv.includes("--now");
  const hours = researchHours();

  // The health server comes up FIRST, before anything can go wrong, so that a
  // broken start can explain itself.
  //
  // It used to exit on missing configuration. The platform then reported a
  // bare "Healthcheck failure" with no cause, because the process was gone
  // before it could serve anything — the deploy was correctly marked failed
  // and told nobody why. Now the reason is in the health response and in the
  // logs, and the endpoint answers 503, so the platform still knows the
  // service is not fit to run.
  const server = once ? null : startHealthServer(PORT);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const razlog =
      "Manjkata SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY. Vpisite ju med spremenljivke okolja (Railway: Variables).";
    update({ state: "ustavljeno", lastError: razlog });
    log("error", razlog);
    if (once) {
      server?.close();
      process.exit(1);
    }
    // Stay up so the reason remains readable instead of vanishing with the
    // process; the 503 keeps the platform honest about the service's state.
    return;
  }
  log("info", "zbiralnik zagnan", {
    nacin: URNIK ? "urnik + rocne zahteve" : "caka na rocne zahteve",
    cilj: brands().length > 0 ? brands() : "vsa osebna vozila",
    pregledOb: URNIK ? hours : "brez urnika",
    maxStrani: MAX_PAGES === 0 ? "brez omejitve" : MAX_PAGES,
  });

  // A stop request does not kill a running sweep outright: the flag lets it
  // finish the page it is on and leave a usable checkpoint. The hard exit after
  // a grace period is there because the platform will kill us anyway — but by
  // then the job row already says where to resume.
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

  // The daily report runs once per calendar day, after a sweep, so it
  // summarises the freshest data. Its failure never touches the collector.
  let lastReportDay: string | null = null;
  const maybeSendReport = async (): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    if (lastReportDay === today) return;
    try {
      const report = await buildDailyReport(connect());
      const outcome = await sendDailyReport(report);
      lastReportDay = today;
      log("info", "dnevno porocilo", {
        datum: report.datum,
        novih: report.novihOglasov,
        aktivnih: report.aktivnih,
        izginilih: report.izginilih,
        modelovVLestvici: report.najhitrejsi.length,
        posiljanje: outcome,
      });
    } catch (err) {
      log("warn", "dnevnega porocila ni bilo mogoce sestaviti", {
        napaka: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (runNow) {
    await runOnce();
    await maybeSendReport();
    if (once) {
      server?.close();
      return;
    }
  }

  // Mode 1: wait for the dashboard. The normal mode, and the only one until the
  // manual research is proven end to end.
  if (!URNIK) {
    const db = connect();
    log("info", "cakam na zahteve iz nadzorne plosce", { vsakihSekund: Math.round(POLL_MS / 1000) });

    while (!stopping) {
      let job: Job | null = null;
      try {
        job = await claimResearch(db);
      } catch (err) {
        // Not being able to READ the queue is a database problem, not a
        // collecting problem: it must not put the worker into the failure
        // back-off that exists for the source pushing back.
        log("warn", "vrste zahtev ni bilo mogoce prebrati", {
          napaka: err instanceof Error ? err.message : String(err),
        });
        await reportHealth(db, { heartbeat: new Date().toISOString() });
      }

      if (job) {
        await runJob(db, job);
        await maybeSendReport();
        continue; // Another request may already be waiting.
      }

      await reportHealth(db, { heartbeat: new Date().toISOString() });
      await sleep(POLL_MS);
    }
    server?.close();
    return;
  }

  // Mode 2: timed sweeps. Off unless AVTONET_URNIK is set.
  for (;;) {
    const failures = current().consecutiveFailures;
    if (failures > 0) {
      // After a failure, wait a while before the next attempt rather than
      // sitting until the next scheduled hour — but never faster than an hour,
      // so a broken worker cannot become a busy one.
      const wait = Math.min(60 * 60_000 * 2 ** (failures - 1), 6 * 60 * 60_000);
      log("warn", "cakam po napaki", { minut: Math.round(wait / 60000), zaporednihNapak: failures });
      await sleep(wait);
    } else {
      const { ms, at } = msUntilNextRun(hours);
      log("info", "cakam na naslednji pregled", { ob: at.toISOString(), cezMinut: Math.round(ms / 60000) });
      await sleep(ms);
    }
    await runOnce();
    await maybeSendReport();
  }
}

main().catch((err) => {
  log("error", "zbiralnik je padel", { napaka: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
