import "dotenv/config";
import { chromium } from "playwright";
import { connect } from "./db.js";
import { detailUrl } from "./detail.js";

/**
 * Two questions the console raised, answered from the data:
 *
 * 1. How many adverts got NON-advert content saved as their detail (the pages
 *    whose "version" is avto.net's own phone number)? Those are marked done at
 *    the current parser version, so without a repair they stay wrong forever.
 *
 * 2. What EXACTLY does the source serve for a genuinely deleted advert — so the
 *    detail phase can recognise "gone" instead of parsing the error page.
 */

async function main(): Promise<void> {
  const db = connect();

  console.log("=".repeat(66));
  console.log("1. SMETI V BAZI");
  console.log("=".repeat(66));

  // The fingerprints of a non-advert page, as seen in the live log.
  const vzorci = [
    { opis: "telefon 080 v verziji", stolpec: "verzija", vzorec: "%080%28%77%" },
    { opis: "'Just a moment' v nazivu", stolpec: "naziv", vzorec: "%Just a moment%" },
    { opis: "':: Avtonet ::' v nazivu", stolpec: "naziv", vzorec: "%:: Avtonet ::%" },
  ];
  for (const v of vzorci) {
    const { count } = await db
      .from("avtonet_oglasi")
      .select("*", { count: "exact", head: true })
      .ilike(v.stolpec, v.vzorec);
    console.log(`  ${v.opis.padEnd(28)} ${count ?? 0}`);
  }

  // A few examples, to see what actually got stored.
  const { data: primeri } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id, naziv, verzija, detajl_zajet")
    .ilike("verzija", "%080%28%77%")
    .limit(5);
  for (const p of (primeri ?? []) as Record<string, unknown>[]) {
    console.log(`    ${p.avtonet_id}: naziv="${String(p.naziv).slice(0, 60)}" verzija="${p.verzija}"`);
  }

  console.log("");
  console.log("=".repeat(66));
  console.log("2. STRAN IZBRISANEGA OGLASA");
  console.log("=".repeat(66));

  const { data: izginuli } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id")
    .eq("status", "izginil")
    .limit(2);
  const kandidata = ((izginuli ?? []) as { avtonet_id: string }[]).map((x) => x.avtonet_id);
  // An ancient id is certainly gone even if our own 'izginil' set is empty.
  if (kandidata.length === 0) kandidata.push("15000000");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const id of kandidata) {
      const context = await browser.newContext({ locale: "sl-SI" });
      const page = await context.newPage();
      try {
        const res = await page.goto(detailUrl(id), { waitUntil: "domcontentloaded", timeout: 45_000 });
        console.log(`  ID ${id}: HTTP ${res?.status()}`);
        console.log(`    URL: ${page.url().slice(0, 100)}`);
        console.log(`    <title>: ${(await page.title()).slice(0, 90)}`);
        const besedilo = await page.evaluate(() =>
          document.body.innerText.replace(/\s+/g, " ").slice(0, 300)
        );
        console.log(`    Besedilo: ${besedilo}`);
      } catch (err) {
        console.log(`  ID ${id}: NAPAKA ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      } finally {
        await context.close();
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
