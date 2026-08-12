import { chromium } from "playwright";
import { detailUrl, parseDetail } from "./detail.js";
import { fetchDetailPage } from "./collector.js";

/**
 * What does the source actually serve for a deleted advert?
 *
 * The console showed two suspicious things at once: a backoff message ("Vir
 * zavrača — upočasnjujem") and detail-save failures on specific adverts whose
 * "titles" were avto.net's own phone number. The hypothesis to test: a DELETED
 * advert triggers both — its page either returns 403 (which we read as a
 * block) or a generic error page (which we parse as if it were a car).
 *
 *   npx tsx src/diag-izbrisan.ts 22601349 22604347 22582331 22594589
 */

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Uporaba: npx tsx src/diag-izbrisan.ts <id> [id …]");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const id of ids) {
      console.log("=".repeat(66));
      console.log(`ID ${id} — ${detailUrl(id)}`);
      const context = await browser.newContext({ locale: "sl-SI" });
      const page = await context.newPage();
      try {
        const res = await page.goto(detailUrl(id), { waitUntil: "domcontentloaded", timeout: 45_000 });
        console.log(`  HTTP: ${res?.status()}  konÄni URL: ${page.url().slice(0, 90)}`);
        const naslov = await page.title();
        console.log(`  <title>: ${naslov.slice(0, 80)}`);
        const besedilo = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 400));
        console.log(`  Besedilo: ${besedilo}`);
      } catch (err) {
        console.log(`  NAPAKA: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      } finally {
        await context.close();
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    // One of them through the real collector path, to see what the parser makes of it.
    console.log("=".repeat(66));
    console.log("PARSER na prvem ID:");
    try {
      const raw = await fetchDetailPage(browser, detailUrl(ids[0]));
      const d = parseDetail(raw);
      console.log(`  naslov: ${d.naslov}`);
      console.log(`  znamka/model: ${d.znamka} / ${d.model}`);
      console.log(`  prodajalec: ${d.prodajalec_naziv}`);
      console.log(`  parov: ${Object.keys(d.dodatni_podatki).length}, znacilk: ${d.oprema_znacilke.length}`);
      console.log(`  besedilo (zacetek): ${raw.text.replace(/\s+/g, " ").slice(0, 250)}`);
    } catch (err) {
      console.log(`  fetchDetailPage: ${err instanceof Error ? err.message : err}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
