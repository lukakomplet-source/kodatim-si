import "dotenv/config";
import { connect } from "./db.js";
import { geokodirajOglase, naloziKraje, poveziNepremicnine } from "./nepremicnine.js";
import { izracunajPosle } from "./posli.js";

/**
 * Enkratni backfill po migraciji faze 2: geokodira obstoječe oglase,
 * vsakemu dodeli kanonično nepremičnino (in poveže ponovne objave) ter
 * izračuna prvi deal feed. Varno ponoviti — vse je idempotentno.
 *
 *   npx tsx src/backfill.ts
 */

async function main() {
  const db = connect();
  const log = (m: string) => console.log(`[backfill] ${m}`);

  log("nalagam šifrant krajev ...");
  const kraji = await naloziKraje(db);
  log(`krajev v šifrantu: ${[...kraji.values()].reduce((s, a) => s + a.length, 0)}`);

  log("geokodiram oglase ...");
  const g = await geokodirajOglase(db, kraji);
  log(`geokodiranih: ${g}`);

  log("povezujem kanonične nepremičnine ...");
  const p = await poveziNepremicnine(db, log);
  log(`novih nepremičnin: ${p.novihNepremicnin}, povezav (ponovne objave): ${p.povezav}, kandidatov: ${p.kandidatov}`);

  log("računam deal feed ...");
  const st = await izracunajPosle(db, log);
  log(`poslov v feedu: ${st}`);

  log("KONČANO");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
