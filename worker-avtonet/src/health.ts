import { createServer, type Server } from "node:http";

/**
 * Health surface for the host and for the dashboard.
 *
 * Two audiences, one truth. The hosting platform polls the HTTP endpoint to
 * decide whether the container is alive; the dashboard reads the same numbers
 * out of Supabase. Keeping them in one place means the container can never
 * report healthy while the dashboard shows a collector that died hours ago.
 *
 * The port also makes the worker deployable as an ordinary web service, not
 * only as a background worker — which on several hosts is the difference
 * between a free tier and a paid one.
 */

export type WorkerState = "ok" | "opozorilo" | "ustavljeno";

export type HealthSnapshot = {
  state: WorkerState;
  startedAt: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastPages: number | null;
  lastFound: number | null;
  lastNew: number | null;
};

const snapshot: HealthSnapshot = {
  state: "ok",
  startedAt: new Date().toISOString(),
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  consecutiveFailures: 0,
  lastPages: null,
  lastFound: null,
  lastNew: null,
};

export function current(): HealthSnapshot {
  return { ...snapshot };
}

export function update(patch: Partial<HealthSnapshot>): HealthSnapshot {
  Object.assign(snapshot, patch);
  return current();
}

/**
 * HTTP 200 while the worker is working or merely warning, 503 once it has
 * given up.
 *
 * "Warning" deliberately stays 200: a host that restarts the container on the
 * first failed pass would turn a temporary block at the source into a restart
 * loop, and a restart loop is exactly how a permanent fault gets hidden. Only
 * the deliberate `ustavljeno` state — many consecutive failures — reports
 * unhealthy, because by then restarting is the right thing to try.
 */
/** Exit code for "another worker already holds the port" — the launcher reads it. */
export const KODA_ZE_TECE = 3;

export function startHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    const snap = current();
    // A frozen process still answers on its port, so the port alone proves
    // nothing. The age of the liveness stamp is what the watchdog reads: it
    // grows without bound exactly when the collector is wedged.
    const healthy = snap.state !== "ustavljeno";
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          ok: healthy,
          heartbeatAgeMs: mirovanjeMs(),
          // The number that actually matters to an outside watchdog: a wedged
          // collector keeps its heartbeat fresh, but not this.
          workAgeMs: mirovanjeDelaMs(),
          waitingForMs: dovoljenoCakanjeMs(),
          ...snap,
        },
        null,
        2
      )
    );
  });

  // A taken port means another worker is already running, which is a reason to
  // stand down — not a fault to retry. Unhandled, the 'error' event threw a
  // stack trace and the launcher's restart loop tried again every ten seconds
  // forever, so two instances produced an endless wall of EADDRINUSE instead of
  // one sentence. Exits with a distinct code the launcher recognises.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n  Zbiralnik ze tece (vrata ${port} so zasedena).\n` +
          `  Odprt imate drugo okno workerja — uporabite tisto.\n` +
          `  Ce ste prepricani, da ne tece, zaprite vsa okna in poskusite znova.\n`
      );
      process.exit(KODA_ZE_TECE);
    }
    console.error(`Health streznik ni uspel: ${err.message}`);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(JSON.stringify({ t: new Date().toISOString(), lvl: "info", msg: `health na portu ${port}` }));
  });
  return server;
}

/**
 * Two different questions, and conflating them cost nine and a half hours.
 *
 * `premik` answers "is this process alive" — the poll loop ticks it. `napredek`
 * answers "did any actual work get done" — one advert fetched, saved or failed.
 * A collector stuck in a wait loop kept answering YES to the first question
 * while the second stood still, so the stall guard slept through the whole
 * night. The guard now watches WORK, and a wait is only excused while the
 * moment it was declared to end is still in the future.
 */
let zadnjiPremik = Date.now();
let zadnjiNapredek = Date.now();
let cakanjeDo = 0;

export function premik(): void {
  zadnjiPremik = Date.now();
}

/** One advert actually handled — success or failure, both count as movement. */
export function napredek(): void {
  zadnjiNapredek = Date.now();
  zadnjiPremik = zadnjiNapredek;
}

/**
 * "I am deliberately waiting until this moment."
 *
 * An absolute time, never a duration: a duration can be re-declared forever,
 * which is exactly the bug this exists to make impossible. Once it passes, the
 * silence is no longer excused.
 */
export function napovedanoCakanjeDo(t: number): void {
  cakanjeDo = t;
  zadnjiPremik = Date.now();
}

export function mirovanjeMs(): number {
  return Date.now() - zadnjiPremik;
}

export function mirovanjeDelaMs(): number {
  return Date.now() - zadnjiNapredek;
}

/** Milliseconds we are still entitled to be silent; 0 once the wait has run out. */
export function dovoljenoCakanjeMs(): number {
  return Math.max(0, cakanjeDo - Date.now());
}
