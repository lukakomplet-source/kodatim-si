import { ProxyAgent } from "undici";

/**
 * Optional rotating proxy support.
 *
 * Deliberately inert by default: with `ENRICHMENT_PROXIES` unset, `nextProxy()`
 * returns null and every request goes out on the local IP exactly as it does
 * today. Setting the env var later switches rotation on with no code change.
 *
 * Why it matters for scale: provider rate limits are per-IP, so throughput
 * scales roughly linearly with the number of usable proxies. It is the only
 * lever that turns ~46 days of enrichment into a few days.
 *
 * Format: comma-separated proxy URLs, e.g.
 *   ENRICHMENT_PROXIES=http://user:pass@host1:8000,http://user:pass@host2:8000
 */

export type ProxyLease = {
  url: string;
  dispatcher: ProxyAgent;
};

type Entry = {
  url: string;
  dispatcher: ProxyAgent;
  cooldownUntil: number;
  failures: number;
};

let entries: Entry[] | null = null;
let cursor = 0;

function cooldownMs(): number {
  const raw = Number(process.env.PROXY_COOLDOWN_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 5 * 60 * 1000;
}

function load(): Entry[] {
  if (entries) return entries;
  const raw = (process.env.ENRICHMENT_PROXIES ?? "").trim();
  if (!raw) {
    entries = [];
    return entries;
  }
  entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url, dispatcher: new ProxyAgent(url), cooldownUntil: 0, failures: 0 }));
  return entries;
}

export function proxyCount(): number {
  return load().length;
}

export function proxiesEnabled(): boolean {
  return load().length > 0;
}

/**
 * Round-robin over proxies that aren't cooling down. Returns null when no
 * proxies are configured (normal local-IP operation) OR when every proxy is
 * currently cooling down — in the latter case the caller falls back to the
 * local IP rather than stalling, which keeps the pipeline moving.
 */
export function nextProxy(): ProxyLease | null {
  const pool = load();
  if (pool.length === 0) return null;

  const now = Date.now();
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[cursor % pool.length];
    cursor = (cursor + 1) % pool.length;
    if (entry.cooldownUntil <= now) {
      return { url: entry.url, dispatcher: entry.dispatcher };
    }
  }
  return null;
}

/** Park a proxy that got blocked (403) or failed to connect, so the next request rotates away from it. */
export function penalizeProxy(url: string): void {
  const pool = load();
  const entry = pool.find((e) => e.url === url);
  if (!entry) return;
  entry.failures += 1;
  entry.cooldownUntil = Date.now() + cooldownMs();
}

export type ProxyStats = { url: string; failures: number; coolingDown: boolean };

/** Snapshot for the worker log. URLs are redacted — they contain credentials. */
export function proxyStats(): ProxyStats[] {
  const now = Date.now();
  return load().map((e) => ({
    url: redact(e.url),
    failures: e.failures,
    coolingDown: e.cooldownUntil > now,
  }));
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return "(neveljaven proxy URL)";
  }
}

/** Test-only: force a reload after changing ENRICHMENT_PROXIES at runtime. */
export function resetProxyPoolForTests(): void {
  entries = null;
  cursor = 0;
}
