import "dotenv/config";
import { connect } from "./db.js";

/**
 * Repairs adverts wrongly marked as gone when the source hit its result cap.
 *
 * avto.net serves at most ~1,000 results per query and then repeats the last
 * page. The collector read that repetition as the end of the market, called the
 * sweep complete, and a complete sweep is licence to mark every unseen advert as
 * disappeared. Research.ts no longer does this — but the rows it already wrote
 * would sit in the history forever and poison the one number this system exists
 * to produce, days on the market.
 *
 * Takes an ISO timestamp: everything marked gone at or after it is restored.
 *
 *   npx tsx src/popravi-izginule.ts 2026-08-10T21:00:00Z
 */

async function main(): Promise<void> {
  const od = process.argv[2];
  if (!od || Number.isNaN(Date.parse(od))) {
    console.error("Uporaba: npx tsx src/popravi-izginule.ts <ISO-cas>");
    process.exitCode = 1;
    return;
  }

  const db = connect();
  const { data, error } = await db
    .from("avtonet_oglasi")
    .select("id, naziv, status_spremenjen")
    .eq("status", "izginil")
    .gte("status_spremenjen", od);
  if (error) throw new Error(error.message);

  const vrstice = data ?? [];
  console.log(`Oznacenih kot izginuli po ${od}: ${vrstice.length}`);
  for (const v of vrstice.slice(0, 5)) {
    console.log(`  - ${String(v.naziv ?? "").slice(0, 60)}`);
  }

  if (vrstice.length > 0) {
    const { error: updErr } = await db
      .from("avtonet_oglasi")
      .update({ status: "aktiven", status_spremenjen: null })
      .in(
        "id",
        vrstice.map((v) => v.id)
      );
    if (updErr) throw new Error(updErr.message);
    console.log(`Popravljeno nazaj na aktiven: ${vrstice.length}`);
  }

  const { count } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("status", "izginil");
  console.log(`Se vedno oznacenih kot izginuli: ${count}`);
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
