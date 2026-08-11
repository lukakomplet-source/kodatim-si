import { chromium } from "playwright";
import { fetchDetailPage } from "./collector.js";
import { detailUrl, parseDetail } from "./detail.js";

/**
 * Dumps ONE advert's detail page and what the parser makes of it.
 *
 * Written because the parser was being extended from a description of a page
 * rather than the page. Every field added to detail.ts should be visible in
 * this output first — that is the difference between a parser that works and a
 * column full of nulls.
 *
 *   npm run dump:detail -- 17669569           (parsed only)
 *   npm run dump:detail -- 17669569 --surovo  (also the raw page)
 */

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) {
    console.error("Uporaba: npm run dump:detail -- <avtonet_id> [--surovo]");
    process.exit(1);
  }
  const pokaziSurovo = process.argv.includes("--surovo");

  const browser = await chromium.launch({ headless: true });
  try {
    const raw = await fetchDetailPage(browser, detailUrl(id));
    const d = parseDetail(raw);

    if (pokaziSurovo) {
      console.log("=".repeat(70));
      console.log(`PARI (${Object.keys(raw.pairs).length})`);
      console.log("=".repeat(70));
      for (const [k, v] of Object.entries(raw.pairs)) console.log(`  ${k} = ${v}`);
      console.log("\n" + "=".repeat(70));
      console.log("BESEDILO");
      console.log("=".repeat(70));
      console.log(raw.text);
    }

    console.log("=".repeat(70));
    console.log(`RAZCLENJENO — ${id}`);
    console.log("=".repeat(70));

    const skalarji: [string, unknown][] = [
      ["verzija", d.verzija],
      ["pogon", d.pogon],
      ["karoserija", d.karoserija],
      ["barva", d.barva],
      ["notranjost", d.notranjost],
      ["pogonski_sklop", d.pogonski_sklop],
      ["stevilo_vrat", d.stevilo_vrat],
      ["stevilo_sedezev", d.stevilo_sedezev],
      ["lastnikov", d.lastnikov],
      ["leto_proizvodnje", d.leto_proizvodnje],
      ["registracija_mesec", d.registracija_mesec],
      ["emisijski_razred", d.emisijski_razred],
      ["co2_g_km", d.co2_g_km],
      ["poraba_l_100km", d.poraba_l_100km],
      ["starost", d.starost],
      ["lokacija", d.lokacija],
      ["prodajalec_naziv", d.prodajalec_naziv],
      ["prodajalec_naslov", d.prodajalec_naslov],
      ["prodajalec_registriran_od", d.prodajalec_registriran_od],
      ["je_dealer", d.je_dealer],
      ["cena_na_poziv", d.cena_na_poziv],
    ];
    for (const [k, v] of skalarji) {
      const oznaka = v === null || v === undefined ? "· null" : `= ${v}`;
      console.log(`  ${k.padEnd(26)} ${oznaka}`);
    }

    console.log("\n  OPREMA PO KATEGORIJAH:");
    for (const [kat, items] of Object.entries(d.oprema_kategorije)) {
      console.log(`    ${kat} (${items.length}): ${items.slice(0, 4).join(" | ")}${items.length > 4 ? " …" : ""}`);
    }

    console.log(`\n  ZNACILKE (${d.oprema_znacilke.length}):`);
    console.log("    " + d.oprema_znacilke.join(", "));

    console.log("\n  OPIS:");
    console.log("    " + (d.opis ?? "· null"));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
