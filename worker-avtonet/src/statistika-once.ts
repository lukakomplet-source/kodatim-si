import "dotenv/config";
import { connect } from "./db.js";
import { izracunajStatistiko } from "./statistika.js";

/**
 * Computes all aggregates right now, on demand — same code the worker runs
 * after each research. For manual refresh and verification:  npm run statistika
 */
async function main(): Promise<void> {
  const db = connect();
  const log = (lvl: string, msg: string, extra?: object) => console.log(`[${lvl}] ${msg}`, extra ?? "");
  await izracunajStatistiko(db, log as never);

  const { data } = await db.from("avtonet_statistika").select("kljuc, izracunano");
  console.log("\nKljuci v bazi:");
  for (const r of data ?? []) console.log(`  ${r.kljuc}  (${r.izracunano})`);
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
