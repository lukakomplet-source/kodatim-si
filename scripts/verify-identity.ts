import { identityConflict } from "@/lib/publicEnrichment/identity";
const cases: [string, object, object, boolean][] = [
  ["AJPES 'SI 33450340' vs CompanyWall 'SI 33450340'", { vat_id: "SI 33450340" }, { vat_id: "SI 33450340" }, false],
  ["'SI 33450340' vs '33450340' (brez predpone)", { vat_id: "SI 33450340" }, { vat_id: "33450340" }, false],
  ["matična 7-mestna vs 10-mestna", { registration_number: "6178898" }, { registration_number: "6178898000" }, false],
  ["DEJAN VIDOVIC 90206118 vs K.V.T. MOBILE 33732531", { vat_id: "90206118" }, { vat_id: "SI 33732531" }, true],
  ["druga matična", { registration_number: "6178898000" }, { registration_number: "3494365000" }, true],
  ["ni podatka za primerjavo", {}, { vat_id: "90206118" }, false],
];
let bad = 0;
for (const [label, a, b, shouldConflict] of cases) {
  const r = identityConflict(a, b);
  const ok = Boolean(r) === shouldConflict;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${label}${r ? `  -> ${r}` : ""}`);
}
process.exit(bad === 0 ? 0 : 1);
