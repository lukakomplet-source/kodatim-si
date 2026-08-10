import "dotenv/config";
import { BlockedError, buildResultsUrl, fetchResultsPage, openBrowser } from "./collector.js";
import { splitZnamkaModel } from "./parse.js";

/**
 * Live smoke test of the riskiest half of the system: does the browser reach
 * avto.net, and does the parser read a real page correctly?
 *
 * Deliberately writes nothing to the database. When a first run goes wrong it
 * is nearly always the network or the parser, and mixing a database error into
 * that makes the failure harder to read, not easier. One page, one request,
 * within the site's own crawl delay.
 *
 *   npm run test:collect
 */

async function main(): Promise<void> {
  const znamka = process.argv[2] ?? "BMW";
  const url = buildResultsUrl({ znamka, stran: 1 });

  console.log(`Zivi test zbiralnika`);
  console.log(`  znamka: ${znamka}`);
  console.log(`  URL:    ${url.slice(0, 90)}...`);
  console.log("");

  const browser = await openBrowser();
  const startedAt = Date.now();

  try {
    const rows = await fetchResultsPage(browser, url);
    const ms = Date.now() - startedAt;

    if (rows.length === 0) {
      console.log(`NAPAKA: stran se je nalozila, a ni bilo nobene vrstice (${ms} ms).`);
      console.log("To pomeni, da se je struktura strani spremenila ali da je vrnjena napacna stran.");
      process.exit(1);
    }

    console.log(`Prebrano: ${rows.length} oglasov v ${ms} ms`);
    console.log("");

    // Field-by-field completeness matters more than the raw count: a parser
    // that returns rows with every field null still "works" by row count.
    const stat = {
      letnik: rows.filter((r) => r.letnik !== null).length,
      km: rows.filter((r) => r.km !== null).length,
      cena: rows.filter((r) => r.cenaEur !== null).length,
      moc: rows.filter((r) => r.kmMoci !== null).length,
      gorivo: rows.filter((r) => r.gorivo !== null).length,
      naziv: rows.filter((r) => r.naziv !== null).length,
    };
    console.log("Izpolnjenost polj:");
    for (const [k, v] of Object.entries(stat)) {
      const pct = Math.round((v / rows.length) * 100);
      console.log(`  ${k.padEnd(8)} ${String(v).padStart(3)}/${rows.length}  ${pct}%`);
    }
    console.log("");

    console.log("Prvih 5 oglasov:");
    for (const r of rows.slice(0, 5)) {
      const { znamka: zn, model } = splitZnamkaModel(r.naziv);
      console.log(
        `  ${r.avtonetId}  ${(zn ?? "?") + " " + (model ?? "")}`.padEnd(46) +
          `${r.letnik ?? "?"} | ${r.km ?? "?"} km | ${r.kmMoci ?? "?"} KM | ${r.cenaEur ?? "?"} EUR`
      );
    }
    console.log("");

    // The parser is only trustworthy if the important fields are nearly always
    // present. Below this line something has drifted and must be looked at.
    const failed = stat.cena / rows.length < 0.8 || stat.letnik / rows.length < 0.8;
    if (failed) {
      console.log("NAPAKA: prevec manjkajocih polj - razclenjevalnik je treba popraviti.");
      process.exit(1);
    }
    console.log("TEST USPESEN.");
  } catch (err) {
    if (err instanceof BlockedError) {
      console.log(`VIR JE ZAVRNIL ZAHTEVEK: ${err.message}`);
      console.log("To ni napaka v kodi. Pocakajte in poskusite kasneje.");
      process.exit(2);
    }
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
