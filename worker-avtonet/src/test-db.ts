import "dotenv/config";
import { connect } from "./db.js";

/**
 * Is the database actually ready for the worker?
 *
 * Checks reachability, every table the worker touches, and — the part a plain
 * SELECT would miss — whether it can really WRITE. A service-role key with a
 * table missing one column fails only on the first insert, which is the worst
 * moment to find out.
 *
 *   npm run test:db
 */

const TABLES = [
  "avtonet_oglasi",
  "avtonet_posnetki",
  "avtonet_iskanja",
  "avtonet_obvestila",
  "avtonet_zdravje",
];

async function main(): Promise<void> {
  const db = connect();
  let failures = 0;

  console.log("Tabele:");
  for (const table of TABLES) {
    const { error } = await db.from(table).select("*").limit(1);
    if (error) {
      failures += 1;
      const hint = error.code === "PGRST205" ? " (tabela ne obstaja - pozenite migracijo)" : "";
      console.log(`  NAPAKA ${table.padEnd(20)} ${error.code ?? ""}${hint}`);
    } else {
      console.log(`  OK     ${table}`);
    }
  }

  if (failures > 0) {
    console.log(`\n${failures} tabel manjka. Pozenite supabase/migration_avtonet.sql.`);
    process.exitCode = 1;
    return;
  }

  // A real write, then removed again. Reading proves the table exists; only
  // writing proves the columns and the key are right.
  console.log("\nPisanje:");
  const proba = `test-${Date.now()}`;
  const { data, error: insErr } = await db
    .from("avtonet_oglasi")
    .insert({
      avtonet_id: proba,
      url: "https://example.invalid/test",
      znamka: "TEST",
      naziv: "Testni zapis zbiralnika",
      status: "aktiven",
    })
    .select("id")
    .single();

  if (insErr || !data) {
    console.log(`  NAPAKA vstavljanje: ${insErr?.message}`);
    process.exitCode = 1;
    return;
  }
  console.log("  OK     vstavljanje oglasa");

  const { error: snapErr } = await db
    .from("avtonet_posnetki")
    .insert({ oglas_id: data.id, cena_eur: 1234.5, km: 1000, status: "aktiven", surovo: "test" });
  console.log(snapErr ? `  NAPAKA posnetek: ${snapErr.message}` : "  OK     vstavljanje posnetka");
  if (snapErr) process.exitCode = 1;

  const { error: healthErr } = await db
    .from("avtonet_zdravje")
    .update({ heartbeat: new Date().toISOString() })
    .eq("id", "worker");
  console.log(healthErr ? `  NAPAKA zdravje: ${healthErr.message}` : "  OK     zapis zdravja");
  if (healthErr) process.exitCode = 1;

  // Snapshots cascade with the listing, so one delete cleans both.
  const { error: delErr } = await db.from("avtonet_oglasi").delete().eq("id", data.id);
  console.log(delErr ? `  NAPAKA ciscenje: ${delErr.message}` : "  OK     testni zapis odstranjen");

  console.log(process.exitCode ? "\nBAZA NI PRIPRAVLJENA." : "\nBAZA PRIPRAVLJENA.");
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
