import "dotenv/config";
import { BlockedError, collectAll, openBrowser } from "./collector.js";
import { connect, markDisappeared, reportHealth, upsertListings } from "./db.js";

/**
 * SBN Auto collector.
 *
 *   npm run once   — one pass, then exit (use this for the first live test)
 *   npm start      — keeps running, one pass every AVTONET_INTERVAL_MIN
 *
 * Deliberately conservative. avto.net's robots.txt permits everything and asks
 * for a ten-second crawl delay; that delay is honoured between every page, and
 * the first 403 or 429 stops the run and records the reason instead of
 * retrying harder. Being blocked is a message, not an obstacle to route
 * around — and a scraper that gets the account banned is worth nothing to the
 * client.
 */

const INTERVAL_MIN = Number(process.env.AVTONET_INTERVAL_MIN ?? 60);
const MAX_PAGES = Number(process.env.AVTONET_MAX_PAGES ?? 3);

/** Brands to sweep. Kept in env so the client's interests can change without a deploy. */
function brands(): string[] {
  const raw = (process.env.AVTONET_ZNAMKE ?? "BMW").trim();
  return raw.split(",").map((b) => b.trim()).filter(Boolean);
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOnce(): Promise<void> {
  const db = connect();
  const startedAt = new Date().toISOString();
  await reportHealth(db, { zadnji_zagon: startedAt, zadnja_napaka: null });

  const browser = await openBrowser();
  try {
    let found = 0;
    let fresh = 0;

    for (const znamka of brands()) {
      log(`Zbiram: ${znamka}`);
      const rows = await collectAll(browser, { znamka }, MAX_PAGES);
      log(`  ${znamka}: ${rows.length} oglasov`);
      found += rows.length;

      const outcome = await upsertListings(db, rows);
      fresh += outcome.novi.length;
      if (outcome.novi.length > 0) log(`  novih: ${outcome.novi.length}`);
      for (const change of outcome.spremembeCene) {
        log(`  cena: ${change.row.naziv} ${change.staraCena} € -> ${change.novaCena} €`);
      }

      // Only listings from THIS brand are in scope, so a sweep of one brand
      // cannot declare the rest of the database gone.
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
      if (gone > 0) log(`  izginilo: ${gone}`);
    }

    await reportHealth(db, {
      zadnji_uspeh: new Date().toISOString(),
      najdenih_zadnjic: found,
      novih_zadnjic: fresh,
      zadnja_napaka: null,
    });
    log(`Konec: ${found} oglasov, ${fresh} novih.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await reportHealth(db, { zadnja_napaka: message });
    if (err instanceof BlockedError) {
      log(`USTAVLJENO — ${message}`);
      return; // a block is not a crash; the next scheduled pass may be fine
    }
    throw err;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  log(`SBN Auto zbiralnik zagnan (znamke: ${brands().join(", ")}, ${once ? "en zagon" : `vsakih ${INTERVAL_MIN} min`})`);

  for (;;) {
    try {
      await runOnce();
    } catch (err) {
      log(`Napaka: ${err instanceof Error ? err.message : err}`);
    }
    if (once) return;
    await sleep(INTERVAL_MIN * 60_000);
  }
}

main().catch((err) => {
  console.error("Zbiralnik je padel:", err);
  process.exit(1);
});
