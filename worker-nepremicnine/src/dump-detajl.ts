import "dotenv/config";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { connect } from "./db.js";

/**
 * Razvojno orodje: odpre eno detajlno stran oglasa in shrani njen HTML, da je
 * mogoče napisati parser proti resnični strani in ne proti domnevi.
 *
 * Zakaj obstaja: selektorji, napisani "na pamet", so v tem projektu že dvakrat
 * stali dan dela (galerija na avto.netu se je rezala na dveh mestih, ker nihče
 * ni pogledal, kaj stran res vrne). En prenos je ceneje od enega ugibanja.
 *
 *   npx tsx src/dump-detajl.ts nepremicnine.net
 *   npx tsx src/dump-detajl.ts bolha.com
 */

const vir = process.argv[2] ?? "nepremicnine.net";
const kam = process.argv[3] ?? `C:\\Users\\lukak\\AppData\\Local\\Temp\\detajl-${vir.replace(/\W+/g, "-")}.html`;

/** Prvi argument je lahko tudi cel naslov — takrat baze ne potrebujemo. */
let data: { url: string } | null = vir.startsWith("http") ? { url: vir } : null;
if (!data) {
  const db = connect();
  const { data: vrstica } = await db
    .from("nep_oglasi")
    .select("url, vir_id, tip")
    .eq("vir", vir)
    .eq("status", "aktiven")
    .limit(1)
    .maybeSingle();
  data = vrstica as { url: string } | null;
}

if (!data) {
  console.error(`Za vir ${vir} ni aktivnega oglasa.`);
  process.exit(2);
}

console.log(`odpiram ${data.url}`);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  locale: "sl-SI",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
});
const page = await ctx.newPage();
const res = await page.goto(data.url as string, { waitUntil: "domcontentloaded", timeout: 45_000 });
console.log("HTTP", res?.status());
await page.waitForTimeout(2500);
const html = await page.content();
writeFileSync(kam, html, "utf8");
console.log(`shranjeno: ${kam} (${Math.round(html.length / 1024)} kB)`);
await browser.close();
