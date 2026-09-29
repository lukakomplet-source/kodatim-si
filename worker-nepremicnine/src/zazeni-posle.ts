import "dotenv/config";
import { connect } from "./db.js";
import { izracunajPosle } from "./posli.js";

/**
 * Samo deal feed, brez pregleda: za preverjanje sprememb pravil v posli.ts.
 * Worker ga sicer izračuna sam po vsakem pregledu.
 *
 *   npm run posli
 */
async function main() {
  const db = connect();
  const zacetek = Date.now();
  const st = await izracunajPosle(db, (m) => console.log(`[posli] ${m}`));
  console.log(`[posli] v feedu ${st}, ${Math.round((Date.now() - zacetek) / 1000)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
