import { chromium } from "playwright";
import { adapter } from "./viri/bolha.js";
import { uporabniskiAgent } from "./identiteta.js";

/**
 * Nadzorovani test Bolha adapterja: prebere 1. stran dveh kategorij v ŽIVO
 * (2 zahtevka, 6 s razmika — enaka vljudnost kot v produkciji), NIČ ne piše
 * v bazo. Uspeh = kartice z virId, ceno in krajem ter znana zadnja stran.
 */

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  let napak = 0;
  try {
    const rezine = adapter.rezine().filter((r) => ["prodaja/hisa", "oddaja/stanovanje"].includes(r.oznaka));
    for (const rezina of rezine) {
      const ctx = await browser.newContext({
        locale: "sl-SI",
        userAgent: uporabniskiAgent(),
      });
      const page = await ctx.newPage();
      const url = adapter.seznamUrl(rezina, 1);
      const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      console.log(`\n${rezina.oznaka}: ${url} -> HTTP ${r?.status()}`);
      await page.waitForTimeout(2500);
      const { kartice, zadnjaStran } = await adapter.preberiSeznam(page);
      console.log(`  kartic: ${kartice.length}, zadnja stran: ${zadnjaStran}`);
      if (kartice.length < 10) {
        napak += 1;
        console.log("  NAPAKA: premalo kartic — selektorji ne primejo.");
      }
      const normalizirane = kartice.map((k) => adapter.normaliziraj(k, rezina));
      const sCeno = normalizirane.filter((n) => n.cenaEur !== null).length;
      const sKrajem = normalizirane.filter((n) => n.kraj !== null).length;
      const sPovrsino = normalizirane.filter((n) => n.povrsinaM2 !== null).length;
      console.log(`  s ceno: ${sCeno}/${normalizirane.length}, s krajem: ${sKrajem}, s površino: ${sPovrsino}`);
      if (sCeno < normalizirane.length * 0.5) {
        napak += 1;
        console.log("  NAPAKA: manj kot polovica kartic ima ceno.");
      }
      for (const n of normalizirane.slice(0, 3)) {
        console.log(`  · [${n.virId}] ${n.naslov?.slice(0, 60)} | ${n.kraj} | ${n.cenaEur} € | ${n.povrsinaM2 ?? "?"} m²`);
      }
      await ctx.close();
      await new Promise((res) => setTimeout(res, 6000));
    }
  } finally {
    await browser.close();
  }
  console.log(napak === 0 ? "\nVSE OK" : `\n${napak} NAPAK`);
  process.exitCode = napak === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
