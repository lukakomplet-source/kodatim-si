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
export function startHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    const snap = current();
    const healthy = snap.state !== "ustavljeno";
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: healthy, ...snap }, null, 2));
  });
  server.listen(port, () => {
    console.log(JSON.stringify({ t: new Date().toISOString(), lvl: "info", msg: `health na portu ${port}` }));
  });
  return server;
}
