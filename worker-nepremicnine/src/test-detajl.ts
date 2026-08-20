import "dotenv/config";
import { chromium } from "playwright";
import { connect } from "./db.js";
import { najdiVir } from "./viri/index.js";
import { vrsticaIzDetajla } from "./detajli.js";

/**
 * Preveri detajlni bralnik enega vira na TREH resničnih oglasih in izpiše, kaj
 * je prebral in kaj bi šlo v bazo. Nič ne zapiše.
 *
 * Trije, ne eden: en oglas ne pokaže razlike med "vir tega polja nima" in "ta
 * oglas tega polja nima". Prav to je razlika med pokvarjenim selektorjem in
 * praznim podatkom, in prav to je v tem projektu že dvakrat ušlo.
 *
 *   npx tsx src/test-detajl.ts nepremicnine.net
 */

const virIme = process.argv[2] ?? "nepremicnine.net";
const vir = najdiVir(virIme);
const detajli = vir.detajli;
if (!detajli) {
  console.error(`Vir ${vir.vir} nima detajlnega bralnika.`);
  process.exit(2);
}

/**
 * Drugi argument je lahko naslov konkretnega oglasa. To potrebujejo novi viri,
 * ki jih v bazi še ni — adapter je treba preveriti PREDEN vir sploh vklopimo.
 */
const rocniUrl = process.argv.slice(3).filter((a) => a.startsWith("http"));
let oglasi: { url: string; vir_id: string; tip: string | null }[] = rocniUrl.map((u) => ({
  url: u,
  vir_id: "(ročno)",
  tip: null,
}));

if (oglasi.length === 0) {
  const db = connect();
  const { data } = await db
    .from("nep_oglasi")
    .select("url, vir_id, tip, cena_eur")
    .eq("vir", vir.vir)
    .eq("status", "aktiven")
    .order("first_seen", { ascending: false })
    .limit(3);
  oglasi = (data ?? []) as { url: string; vir_id: string; tip: string | null }[];
}
if (oglasi.length === 0) {
  console.error(`Za vir ${vir.vir} ni aktivnih oglasov.`);
  process.exit(2);
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
let uspelo = 0;
for (const o of oglasi) {
  const ctx = await browser.newContext({
    locale: "sl-SI",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    const r = await page.goto(o.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    console.log(`\n=== ${o.vir_id} (${o.tip ?? "?"}) HTTP ${r?.status()} ===`);
    console.log(o.url);
    await page.waitForTimeout(1500);
    const d = await detajli.preberi(page);
    const vrstica = vrsticaIzDetajla(d);
    const stSlik = Array.isArray(d.slikeUrls) ? d.slikeUrls.length : 0;
    console.log(`polj za bazo: ${Object.keys(vrstica).length}, slik: ${stSlik}`);
    for (const [k, v] of Object.entries(vrstica)) {
      if (k === "detajl_raw" || k === "slike_urls" || k === "opis") continue;
      console.log(`  ${k}: ${String(v).slice(0, 80)}`);
    }
    console.log(`  opis: ${String(vrstica.opis ?? "").slice(0, 100)}…`);
    console.log(`  lastnosti: ${Object.keys(d.lastnosti ?? {}).join(" | ").slice(0, 300)}`);
    if (Object.keys(vrstica).length >= 3) uspelo += 1;
  } catch (e) {
    console.log(`  NAPAKA: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
  await new Promise((r) => setTimeout(r, detajli.zamikMs));
}
await browser.close();

console.log(`\n${uspelo}/${oglasi.length} oglasov prebranih z vsaj tremi polji.`);
process.exit(uspelo === oglasi.length ? 0 : 1);
