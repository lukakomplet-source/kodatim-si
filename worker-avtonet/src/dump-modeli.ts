import { chromium } from "playwright";
import { fetchBrands } from "./collector.js";

/**
 * Prints the source's brand catalogue as a TypeScript literal.
 *
 * The brand list is what lets a title be split into brand / model / trim, and a
 * hand-typed list would silently mis-split every brand it forgot. This
 * regenerates the snapshot in parse.ts from the source itself:
 *
 *   npm run dump:modeli > /tmp/znamke.txt
 */

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const znamke = await fetchBrands(browser);
    console.error(`${znamke.length} znamk`);
    console.log(znamke.map((z) => `  "${z}",`).join("\n"));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
