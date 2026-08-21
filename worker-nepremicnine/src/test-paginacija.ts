import "dotenv/config";
import { chromium } from "playwright";
import { najdiVir } from "./viri/index.js";
import { preveriIzziv } from "./izziv.js";
import { uporabniskiAgent } from "./identiteta.js";

/**
 * Prehodi prvih N strani ene rezine in izpiše, koliko NOVIH oglasov prinese
 * vsaka. Namenjeno vprašanju "ali paginacija res pride do konca kategorije".
 *
 * Povod: baza je imela 128 oglasov v kategoriji, za katero vir sam pravi, da
 * jih ima 385. Ustavljanje na napačnem mestu je tiha izguba dveh tretjin trga
 * in se v nobenem dnevniku ne vidi kot napaka.
 *
 *   npx tsx src/test-paginacija.ts nepremicnine.net "prodaja/podravska/stanovanje" 8
 */

const virIme = process.argv[2] ?? "nepremicnine.net";
const oznaka = process.argv[3] ?? "prodaja/podravska/stanovanje";
const doStrani = Number(process.argv[4] ?? 8);

const vir = najdiVir(virIme);
if (!vir) {
  console.error(`Vira "${virIme}" ni v registru.`);
  process.exit(2);
}
const rezina = vir.rezine().find((r) => r.oznaka === oznaka);
if (!rezina) {
  console.error(`Rezine "${oznaka}" ni.`);
  process.exit(2);
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const videni = new Set<string>();
let skupajPovedano: number | null = null;

for (let stran = 1; stran <= doStrani; stran++) {
  const ctx = await browser.newContext({
    locale: "sl-SI",
    userAgent: uporabniskiAgent(),
  });
  const page = await ctx.newPage();
  const url = vir.seznamUrl(rezina, stran);
  try {
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1500);
    await preveriIzziv(page);
    const { kartice, zadnjaStran, skupajZadetkov } = await vir.preberiSeznam(page);
    if (skupajZadetkov != null) skupajPovedano = skupajZadetkov;
    const nove = kartice.filter((k) => !videni.has(k.virId));
    for (const k of nove) videni.add(k.virId);
    console.log(
      `stran ${String(stran).padStart(2)} | HTTP ${r?.status()} | kartic ${String(kartice.length).padStart(3)} | novih ${String(
        nove.length
      ).padStart(3)} | skupaj videnih ${videni.size} | zadnjaStran pravi ${zadnjaStran ?? "?"} | url ${url}`
    );
    if (kartice.length === 0) {
      console.log("   (prazna stran — konec)");
      break;
    }
  } catch (e) {
    console.log(`stran ${stran} NAPAKA: ${e instanceof Error ? e.message : String(e)}`);
    break;
  } finally {
    await ctx.close();
  }
  await new Promise((r) => setTimeout(r, vir.omejitve.zamikMs));
}
await browser.close();

console.log(`\nUnikatnih oglasov v ${doStrani} straneh: ${videni.size}`);
if (skupajPovedano != null) {
  console.log(`Vir pravi, da jih je v tej rezini ${skupajPovedano}.`);
  const naStran = Math.max(1, Math.round(videni.size / Math.min(doStrani, 99)));
  console.log(`Pri ~${naStran} na stran bi za vse potrebovali ~${Math.ceil(skupajPovedano / naStran)} strani.`);
}
