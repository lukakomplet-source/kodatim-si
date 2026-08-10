import "dotenv/config";
import { collectAll, fetchDetailPage, openBrowser } from "./collector.js";
import { detailUrl, parseDetail } from "./detail.js";

/**
 * Phase 2 against real advert pages.
 *
 * Takes a few listings from a live results page and opens each one, so the test
 * exercises exactly the path the research uses — including the ten second delay
 * between requests, which is why it is deliberately slow.
 *
 * What it asserts is completeness, not merely "no crash": a parser that returns
 * an object of nulls passes any smoke test and is worthless.
 *
 *   npm run test:detail
 */

const HOW_MANY = Number(process.argv[2] ?? 3);
const CRAWL_DELAY_MS = Number(process.env.AVTONET_CRAWL_DELAY_MS ?? 10_000);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const browser = await openBrowser();
  try {
    const { rows } = await collectAll(browser, { znamka: "BMW" }, 1);
    const sample = rows.slice(0, HOW_MANY);
    console.log(`Testiram podrobnosti za ${sample.length} oglasov (10 s med zahtevki)\n`);

    const filled: Record<string, number> = {};
    let pairsTotal = 0;

    for (const row of sample) {
      await sleep(CRAWL_DELAY_MS);
      const raw = await fetchDetailPage(browser, detailUrl(row.avtonetId));
      const d = parseDetail(raw);
      pairsTotal += Object.keys(d.dodatni_podatki).length;

      console.log(`--- ${row.avtonetId}  ${row.naziv ?? ""}`);
      console.log(`  verzija:     ${d.verzija ?? "(NULL)"}`);
      console.log(`  karoserija:  ${d.karoserija ?? "(NULL)"}`);
      console.log(`  lokacija:    ${d.lokacija ?? "(NULL)"}`);
      console.log(`  pogon:       ${d.pogon ?? "(NULL)"}`);
      console.log(`  barva:       ${d.barva ?? "(NULL)"}`);
      console.log(`  prodajalec:  ${d.prodajalec_naziv ?? "(NULL)"}`);
      console.log(`  oprema:      ${d.oprema ? d.oprema.slice(0, 60) + "..." : "(NULL)"}`);
      console.log(`  opis:        ${d.opis ? d.opis.slice(0, 60) + "..." : "(NULL)"}`);
      console.log(`  parov:       ${Object.keys(d.dodatni_podatki).length}  [${Object.keys(d.dodatni_podatki).slice(0, 8).join(", ")}]`);
      console.log("");

      for (const [k, v] of Object.entries(d)) {
        if (k === "dodatni_podatki") continue;
        if (v !== null && v !== undefined) filled[k] = (filled[k] ?? 0) + 1;
      }
    }

    console.log("Izpolnjenost polj:");
    for (const key of ["verzija", "karoserija", "lokacija", "pogon", "barva", "prodajalec_naziv", "oprema", "opis"]) {
      console.log(`  ${key.padEnd(18)} ${filled[key] ?? 0}/${sample.length}`);
    }
    const avgPairs = Math.round(pairsTotal / Math.max(1, sample.length));
    console.log(`\nPovprecno parov na stran: ${avgPairs}`);

    // The bar: the specification bag must be substantial, and the three fields
    // that were confirmed present on every advert must actually arrive.
    const failures: string[] = [];
    if (avgPairs < 8) failures.push(`premalo parov (${avgPairs}, pricakovano 8+)`);
    // Confirmed present on every advert examined, so absence means the parser
    // drifted, not that the data is missing.
    if ((filled["karoserija"] ?? 0) < sample.length) failures.push("karoserija manjka pri nekaterih oglasih");
    if ((filled["verzija"] ?? 0) < sample.length) failures.push("verzija manjka pri nekaterih oglasih");
    // Equipment is what phase 2 exists for; zero of it means the section
    // heading changed again and the whole second pass is pointless.
    if ((filled["oprema"] ?? 0) === 0) failures.push("oprema ni bila najdena pri nobenem oglasu");

    if (failures.length > 0) {
      console.log(`\nNAPAKE:\n  - ${failures.join("\n  - ")}`);
      process.exitCode = 1;
    } else {
      console.log("\nTEST USPESEN.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
