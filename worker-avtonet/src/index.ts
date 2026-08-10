import "dotenv/config";
import { BlockedError, collectAll, openBrowser } from "./collector.js";
import { connect, markDisappeared, reportHealth, upsertListings } from "./db.js";
import { current, startHealthServer, update, type WorkerState } from "./health.js";
import { buildDailyReport, sendDailyReport } from "./report.js";

/**
 * SBN Auto collector — the long-running production process.
 *
 * Runs on its own, forever, with no human in the loop: it schedules itself,
 * survives failures, and reports its own condition. The only reason to open a
 * terminal is curiosity.
 *
 * Two principles decide most of the design.
 *
 * First, the source sets the pace. avto.net's robots.txt permits everything
 * and asks for a ten-second crawl delay; that is honoured between every page,
 * and a 403/429 ends the pass and is written down rather than retried harder.
 * No proxy rotation, no IP rotation, no captcha work — a collector that gets
 * the client banned is worth less than no collector.
 *
 * Second, a restart must never hide a fault. Consecutive failures are counted
 * and, past a threshold, the worker enters a visible `ustavljeno` state and
 * backs off — instead of crashing so the platform restarts it into the same
 * wall every minute, which is how a permanent problem looks healthy for weeks.
 */

const INTERVAL_MIN = Number(process.env.AVTONET_INTERVAL_MIN ?? 60);
const MAX_PAGES = Number(process.env.AVTONET_MAX_PAGES ?? 3);
const PORT = Number(process.env.PORT ?? 8080);
/** Failures in a row before the worker stops calling itself healthy. */
const FAILURES_BEFORE_STOP = Number(process.env.AVTONET_MAX_FAILURES ?? 5);

function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>): void {
  // One JSON object per line: readable in a terminal, and greppable in every
  // hosting platform's log viewer without a parser.
  console.log(JSON.stringify({ t: new Date().toISOString(), lvl: level, msg, ...extra }));
}

function brands(): string[] {
  const raw = (process.env.AVTONET_ZNAMKE ?? "BMW").trim();
  return raw.split(",").map((b) => b.trim()).filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type PassResult = { found: number; fresh: number; pages: number; blocked: boolean };

async function runOnce(): Promise<PassResult> {
  const db = connect();
  const startedAt = new Date().toISOString();
  update({ lastRunAt: startedAt });
  await reportHealth(db, { zadnji_zagon: startedAt, heartbeat: startedAt });

  const browser = await openBrowser();
  let found = 0;
  let fresh = 0;
  let pages = 0;

  try {
    for (const znamka of brands()) {
      log("info", "zbiram", { znamka });
      const { rows, pages: strani } = await collectAll(browser, { znamka }, MAX_PAGES);
      pages += strani;
      found += rows.length;
      log("info", "prebrano", { znamka, strani, oglasov: rows.length });

      const outcome = await upsertListings(db, rows);
      fresh += outcome.novi.length;
      if (outcome.novi.length > 0) log("info", "novi oglasi", { znamka, novih: outcome.novi.length });
      for (const c of outcome.spremembeCene) {
        log("info", "sprememba cene", { oglas: c.row.naziv, staraCena: c.staraCena, novaCena: c.novaCena });
      }

      // Scoped to this brand: a sweep of one brand must not declare the rest
      // of the database gone.
      const { data: scope } = await db
        .from("avtonet_oglasi")
        .select("avtonet_id")
        .eq("znamka", znamka)
        .eq("status", "aktiven");
      const gone = await markDisappeared(
        db,
        rows.map((r) => r.avtonetId),
        (scope ?? []).map((s) => s.avtonet_id as string)
      );
      if (gone > 0) log("info", "izginuli oglasi", { znamka, izginilo: gone });
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
    log("info", "krog končan", { oglasov: found, novih: fresh, strani: pages });
    return { found, fresh, pages, blocked: false };
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

    // A block is the source telling us to stop, not a crash. Recorded, not
    // fought — and the next scheduled pass, after a longer wait, may be fine.
    log(blocked ? "warn" : "error", blocked ? "vir je zavrnil zahtevek" : "napaka v krogu", {
      napaka: message,
      zaporednihNapak: failures,
      stanje: state,
    });
    return { found, fresh, pages, blocked };
  } finally {
    await browser.close();
  }
}

/**
 * How long to wait before trying again.
 *
 * A healthy pass waits the configured interval. After failures the wait
 * doubles, capped at six hours: enough to let a temporary block at the source
 * expire, and slow enough that a broken worker is not hammering anything while
 * it waits to be noticed.
 */
function nextDelayMs(failures: number): number {
  const base = INTERVAL_MIN * 60_000;
  if (failures === 0) return base;
  return Math.min(base * 2 ** failures, 6 * 60 * 60_000);
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");

  // Missing configuration is fatal on purpose: exiting makes the host show the
  // deploy as failed, which is honest. Running on with no database would look
  // healthy and collect nothing.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log("error", "Manjkata SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY. Glej .env.example.");
    process.exit(1);
  }

  const server = once ? null : startHealthServer(PORT);
  log("info", "zbiralnik zagnan", {
    znamke: brands(),
    nacin: once ? "en zagon" : `vsakih ${INTERVAL_MIN} min`,
    maxStrani: MAX_PAGES,
  });

  const shutdown = () => {
    log("info", "zaustavljam");
    server?.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // The daily report runs on its own clock, not on the collection cycle: once
  // per calendar day, after a pass, so it summarises the freshest data. Its
  // failure is never allowed to touch the collector.
  let lastReportDay: string | null = null;
  const maybeSendReport = async (): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();
    const reportHour = Number(process.env.REPORT_HOUR ?? 7);
    if (lastReportDay === today || hour < reportHour) return;
    try {
      const report = await buildDailyReport(connect());
      const outcome = await sendDailyReport(report);
      lastReportDay = today;
      log("info", "dnevno porocilo", { ...report, najhitrejsi: report.najhitrejsi.length, posiljanje: outcome });
      if (outcome === "preskoceno") {
        log("info", "porocilo ni bilo poslano - RESEND_API_KEY / REPORT_EMAIL_TO / REPORT_EMAIL_FROM niso nastavljeni");
      }
    } catch (err) {
      log("warn", "dnevnega porocila ni bilo mogoce sestaviti", {
        napaka: err instanceof Error ? err.message : String(err),
      });
    }
  };

  for (;;) {
    await runOnce();
    if (once) {
      server?.close();
      return;
    }
    await maybeSendReport();
    const failures = current().consecutiveFailures;
    const wait = nextDelayMs(failures);
    if (failures > 0) log("warn", "čakam pred ponovnim poskusom", { minut: Math.round(wait / 60000), zaporednihNapak: failures });
    await sleep(wait);
  }
}

main().catch((err) => {
  log("error", "zbiralnik je padel", { napaka: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
