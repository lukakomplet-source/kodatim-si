import "dotenv/config";
import { connect } from "./db.js";
import { odsekPoslov, preberiPosleZStevilom } from "./dealfeed.js";

/**
 * Kaj bo v dnevni posti pisalo pod "Top posli danes" — brez posiljanja.
 *
 *   npx tsx src/preveri-odsek-poslov.ts
 */
async function main(): Promise<void> {
  const db = connect();
  const { posli, odVseh } = await preberiPosleZStevilom(db, 10);
  console.log(`poslov skupaj danes: ${odVseh}, od tega fizicnih oseb: ${posli.length}`);
  for (const p of posli.slice(0, 5)) {
    console.log(`  ${(p.naziv ?? p.model).slice(0, 44).padEnd(44)} ${Math.round(p.cena).toLocaleString("sl-SI")} EUR  jeDealer=${p.jeDealer}`);
  }
  const html = odsekPoslov(posli, odVseh);
  const besedilo = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  console.log("\n--- kako se bo brala posta ---");
  console.log(besedilo.slice(0, 700));
}
main().catch((e) => { console.error(e); process.exit(1); });
