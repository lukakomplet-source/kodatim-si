import "dotenv/config";
import { connect } from "./db.js";

/**
 * Re-queues the adverts whose detail pass stored page furniture as data.
 *
 * Measured live (diag-junk, 12. 8. 2026): 710 adverts — almost all new-vehicle
 * showroom pages, which have no h1 — hold avto.net's own phone number
 * ("080 / 28 77") as their trim level. They are stamped with the current parser
 * version, so without this they would stay wrong forever.
 *
 * The junk fields are cleared and detajl_verzija reset to 0, which puts them
 * back into phase 2's queue; the fixed parser re-reads them on the next round.
 *
 * RUN THIS ONLY AFTER THE WORKER IS RESTARTED ON THE FIXED PARSER — a worker
 * still running the old code would simply re-produce the junk.
 *
 *   npm run popravi:novo             (pokaže, koliko bi popravil)
 *   npm run popravi:novo -- --zares  (dejansko popravi)
 */

async function main(): Promise<void> {
  const zares = process.argv.includes("--zares");
  const db = connect();

  const { count } = await db
    .from("avtonet_oglasi")
    .select("*", { count: "exact", head: true })
    .ilike("verzija", "%080%28%77%");

  console.log(`Oglasov s telefonsko številko namesto verzije: ${count ?? 0}`);
  if (!count) return;

  if (!zares) {
    console.log("Samo prikaz. Za dejansko popravilo dodajte --zares (po restartu workerja!).");
    return;
  }

  const { error, count: popravljenih } = await db
    .from("avtonet_oglasi")
    .update({ verzija: null, detajl_verzija: 0, detajl_zajet: null }, { count: "exact" })
    .ilike("verzija", "%080%28%77%");
  if (error) throw new Error(error.message);

  console.log(`Popravljenih: ${popravljenih ?? "?"} — 2. faza jih bo ponovno prebrala v naslednjem krogu.`);
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
