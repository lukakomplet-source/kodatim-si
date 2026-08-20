import "dotenv/config";
import { chromium } from "playwright";
import { najdiVir } from "./viri/index.js";
import { preveriIzziv } from "./izziv.js";

/**
 * Prebere PRVO stran prve rezine izbranega vira in izpiše, kaj je razbral.
 * Ničesar ne zapiše v bazo — namenjeno preverjanju selektorjev novega
 * adapterja, preden se vir sploh vklopi.
 *
 *   npx tsx src/test-seznam.ts nepremicnine.siol.net
 *   npx tsx src/test-seznam.ts oglasi.svet24.si 3     (prve tri rezine)
 */

const virIme = process.argv[2] ?? "nepremicnine.siol.net";
const kolikoRezin = Number(process.argv[3] ?? 1);
const vir = najdiVir(virIme);
if (!vir) {
  console.error(`Vira "${virIme}" ni v registru adapterjev.`);
  process.exit(2);
}

const rezine = vir.rezine().slice(0, kolikoRezin);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  locale: "sl-SI",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
});

let uspelo = 0;
for (const rezina of rezine) {
  const url = vir.seznamUrl(rezina, 1);
  const page = await ctx.newPage();
  try {
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    console.log(`\n=== ${rezina.oznaka} — HTTP ${r?.status()} ===\n${url}`);
    await page.waitForTimeout(2000);
    await preveriIzziv(page);
    const { kartice, zadnjaStran } = await vir.preberiSeznam(page);
    console.log(`kartic: ${kartice.length}, zadnja stran: ${zadnjaStran ?? "?"}`);
    for (const k of kartice.slice(0, 3)) {
      const n = vir.normaliziraj(k, rezina);
      console.log(
        `  [${n.virId}] ${String(n.naslov ?? "").slice(0, 44)} | ${n.cenaEur ?? "?"} € | ${n.povrsinaM2 ?? "?"} m² | ${n.kraj ?? "?"} | ${n.tip}/${n.posel}`
      );
    }
    // Prva stran kategorije s praznim seznamom pomeni pokvarjen selektor ali
    // tiho zavračanje — oboje je treba videti zdaj, ne šele v produkciji.
    if (kartice.length > 0) uspelo += 1;
    else console.log("  OPOZORILO: nobene kartice — selektor ali mehka blokada");
  } catch (e) {
    console.log(`  NAPAKA: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await page.close();
  }
  await new Promise((r) => setTimeout(r, vir.omejitve.zamikMs));
}
await ctx.close();
await browser.close();

console.log(`\n${uspelo}/${rezine.length} rezin je vrnilo kartice.`);
process.exit(uspelo === rezine.length ? 0 : 1);
