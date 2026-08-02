// Shared by CompanyWall/Bizi — plain public sites, not an API with a
// documented quota. Real testing found both a transient 429 AND a real
// `Retry-After: 60` (a hard per-minute-ish cooldown once tripped by a burst
// of requests in a short window). Blocking a live user request for a full
// minute would blow the "<20s per company" budget, so this caps the wait
// to a few seconds for one retry attempt (covers a brief blip) and then
// gives up — the caller surfaces the still-429 response as a clear FAILED
// reason (never silently "not found"), matching how Firecrawl 429s are
// handled elsewhere in this engine.
const MAX_WAIT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function politeFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 429) return response;

  const retryAfterHeader = Number(response.headers.get("retry-after"));
  const waitMs = Math.min(Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 2500, MAX_WAIT_MS);
  await sleep(waitMs);
  return fetch(url, init);
}
