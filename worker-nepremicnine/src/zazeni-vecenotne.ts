import "dotenv/config";
import { connect } from "./db.js";
import { izracunajVecenotne } from "./vecenotne.js";

/**
 * Samo seznam večenotnih blizu mesta, brez pregleda trga. Worker ga sicer
 * izračuna sam enkrat na krog (knjigovodstvo).
 *
 *   npm run vecenotne
 */
async function main() {
  const db = connect();
  const zacetek = Date.now();
  const n = await izracunajVecenotne(db, (m) => console.log(`[vecenotne] ${m}`));
  console.log(`[vecenotne] ${n} hiš, ${Math.round((Date.now() - zacetek) / 1000)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
