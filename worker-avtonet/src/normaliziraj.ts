import "dotenv/config";
import { connect } from "./db.js";
import { normalizirajIdentitete } from "./normalizacija.js";

/**
 * Ročni zagon normalizacije identitete.
 *
 *   npm run normaliziraj           samo oglasi brez izračuna
 *   npm run normaliziraj -- --vse  ponovni izračun čez vse (po spremembi pravil)
 *   npm run normaliziraj -- --vse --test 500
 */

const vse = process.argv.includes("--vse");
const testI = process.argv.indexOf("--test");
const najvec = testI >= 0 ? Number(process.argv[testI + 1] ?? 100) : Infinity;

const zacetek = Date.now();
const izid = await normalizirajIdentitete(connect(), {
  vse,
  najvec,
  napredek: (n) => {
    if (n % 5000 < 500) console.log(`  ... ${n} obdelanih (${Math.round((Date.now() - zacetek) / 1000)} s)`);
  },
});

const p = (x: number) => `${((x / Math.max(1, izid.obdelanih)) * 100).toFixed(1)} %`;
console.log(`\nObdelanih: ${izid.obdelanih} v ${Math.round((Date.now() - zacetek) / 1000)} s`);
console.log(`  VIN:                    ${izid.zVin} (${p(izid.zVin)})`);
console.log(`  izvedenka iz znamke:    ${izid.izvVisoka} (${p(izid.izvVisoka)})`);
console.log(`  izvedenka iz motorja:   ${izid.izvMotor} (${p(izid.izvMotor)})`);
console.log(`  izvedenka samo iz moci: ${izid.izvMoc} (${p(izid.izvMoc)})`);
console.log(`  brez izvedenke:         ${izid.izvNi} (${p(izid.izvNi)})`);
console.log(`  povprecno zaupanje:     ${izid.povprecnoZaupanje}/100`);
console.log(`  neprimerljivih cen:     ${izid.neprimerljivih} (${p(izid.neprimerljivih)})`);
for (const [r, n] of Object.entries(izid.razlogi).sort((a, b) => b[1] - a[1])) {
  console.log(`      ${r}: ${n}`);
}
process.exit(0);
