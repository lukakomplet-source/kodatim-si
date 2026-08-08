/** Does the word matcher find the obvious code for an obvious query? */
async function main() {
  const { searchSkd, SKD_CODES } = await import("@/lib/skd");
  console.log(`seznam: ${SKD_CODES.length} dejavnosti\n`);

  const queries = [
    "gradbeništvo",
    "gradbenistvo",
    "zobozdravnik",
    "frizer",
    "odvoz odpadkov",
    "cestni tovorni",
    "pridelovanje zelenjave",
    "računovodstvo",
    "restavracija",
    "49.4",
    "8121",
    "avtoprevozniki",
  ];

  for (const q of queries) {
    const hits = searchSkd(q, 4);
    console.log(`„${q}“`);
    if (hits.length === 0) console.log("   — ni zadetka (za to je AI iskanje)");
    for (const h of hits) console.log(`   ${h.code}  ${h.label}`);
    console.log();
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
