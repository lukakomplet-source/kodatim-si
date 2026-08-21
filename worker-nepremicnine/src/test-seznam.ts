import "dotenv/config";
import { chromium } from "playwright";
import { najdiVir } from "./viri/index.js";
import { preveriIzziv } from "./izziv.js";
import { uporabniskiAgent } from "./identiteta.js";

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

/**
 * Tretji argument je lahko oznaka konkretne rezine ("prodaja/koroska/garaza").
 * Prav prazne rezine so tiste, ki se v produkciji obnesejo najslabše, zato
 * mora biti mogoče preveriti točno tisto, ki je nekaj podrla.
 */
const izbrana = process.argv[4] ?? null;
const rezine = izbrana
  ? vir.rezine().filter((r) => r.oznaka === izbrana)
  : vir.rezine().slice(0, kolikoRezin);
if (rezine.length === 0) {
  console.error(`Rezine "${izbrana}" pri viru ${vir.vir} ni.`);
  process.exit(2);
}
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  locale: "sl-SI",
  userAgent: uporabniskiAgent(),
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
    const { kartice, zadnjaStran, skupajZadetkov } = await vir.preberiSeznam(page);
    console.log(
      `kartic: ${kartice.length}, zadnja stran: ${zadnjaStran ?? "?"}, vir pravi zadetkov: ${
        skupajZadetkov === null || skupajZadetkov === undefined ? "ne pove" : skupajZadetkov
      }`
    );
    for (const k of kartice.slice(0, 3)) {
      const n = vir.normaliziraj(k, rezina);
      console.log(
        `  [${n.virId}] ${String(n.naslov ?? "").slice(0, 44)} | ${n.cenaEur ?? "?"} € | ${n.povrsinaM2 ?? "?"} m² | ${n.kraj ?? "?"} | ${n.tip}/${n.posel}`
      );
    }
    // Prva stran kategorije s praznim seznamom pomeni pokvarjen selektor ali
    // tiho zavračanje — oboje je treba videti zdaj, ne šele v produkciji.
    // Prazna rezina je veljaven izid, ČE jo vir sam prizna (0 zadetkov).
    // Prazna brez tega priznanja je pokvarjen selektor ali mehka blokada.
    if (kartice.length > 0 || skupajZadetkov === 0) uspelo += 1;
    else console.log("  OPOZORILO: nobene kartice in vir ne pove števila — selektor ali mehka blokada");
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
