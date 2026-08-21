import "dotenv/config";
import { chromium } from "playwright";
import { uporabniskiAgent } from "./identiteta.js";
import { connect } from "./db.js";
import { najdiVir } from "./viri/index.js";
import { preveriIzziv, razbremeniKontekst } from "./izziv.js";
import { hlajenjeDo } from "./samopopravilo.js";

/**
 * Ali vir ponuja URADEN strojni kanal?
 *
 * Preden se pogovarjamo o tem, kako brati HTML manj nadležno, je vredno
 * preveriti, ali vir sam ponuja pot, ki je za stroje namenjena: RSS/Atom vir,
 * sitemap, JSON-LD ali oglašen API. Tak kanal je vedno boljši od branja
 * seznamov — je poceni, stabilen in po namenu javen.
 *
 * Poraba: DVA zahtevka. Prvi je robots.txt (datoteka, ki obstaja prav zato, da
 * jo strojni odjemalci berejo), drugi ena kategorijska stran, na kateri
 * poiščemo `<link rel="alternate">` in podobne napotke. Nič ne ugibamo z
 * naslovi tipa "?rss=1" — ugibanje z naslovi je tolčenje po vratih.
 *
 *   npx tsx src/test-uradna-pot.ts bolha.com
 */

const virIme = process.argv[2] ?? "bolha.com";
const vir = najdiVir(virIme);
if (!vir) {
  console.error(`Vira "${virIme}" ni v registru.`);
  process.exit(2);
}

const db = connect();
const hlajenje = await hlajenjeDo(db, vir.vir);
if (hlajenje) {
  console.error(`Vir ${vir.vir} počiva do ${new Date(hlajenje).toLocaleString("sl-SI")}. Ne dotikamo se ga.`);
  process.exit(4);
}

const rezina = vir.rezine()[0];
const osnova = new URL(vir.seznamUrl(rezina, 1)).origin;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  locale: "sl-SI",
  userAgent: uporabniskiAgent(),
});
await razbremeniKontekst(ctx).catch(() => {});

try {
  // ── 1. robots.txt ──────────────────────────────────────────────────────────
  const p1 = await ctx.newPage();
  const r1 = await p1.goto(`${osnova}/robots.txt`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const robots = r1 && r1.ok() ? await p1.evaluate(() => document.body.innerText) : "";
  await p1.close();
  console.log(`robots.txt: HTTP ${r1?.status()}`);
  const sitemapi = [...robots.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const crawlDelay = robots.match(/^\s*Crawl-delay:\s*(\d+)/im)?.[1] ?? null;
  console.log(`  Sitemap vnosov: ${sitemapi.length}${sitemapi.length ? " -> " + sitemapi.join(", ") : ""}`);
  console.log(`  Crawl-delay: ${crawlDelay ?? "ni naveden"}`);

  await new Promise((r) => setTimeout(r, vir.omejitve.zamikMs));

  // ── 2. ena kategorijska stran: napotki na strojne kanale ───────────────────
  const p2 = await ctx.newPage();
  const r2 = await p2.goto(vir.seznamUrl(rezina, 1), { waitUntil: "domcontentloaded", timeout: 45_000 });
  console.log(`\nkategorijska stran: HTTP ${r2?.status()}`);
  if (r2 && r2.ok()) {
    await p2.waitForTimeout(1200);
    await preveriIzziv(p2);
    const napotki = (await p2.evaluate(() => ({
      alternate: Array.from(document.querySelectorAll('link[rel="alternate"]')).map((l) => ({
        tip: l.getAttribute("type") ?? "",
        naslov: l.getAttribute("href") ?? "",
        ime: l.getAttribute("title") ?? "",
      })),
      ldJson: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).length,
      rssPovezave: Array.from(document.querySelectorAll('a[href*="rss"], a[href*="feed"]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .slice(0, 5),
    })) as { alternate: { tip: string; naslov: string; ime: string }[]; ldJson: number; rssPovezave: string[] });

    const viriStrojni = napotki.alternate.filter((a) => /rss|atom|xml|json/i.test(a.tip));
    console.log(`  <link rel="alternate"> strojnih: ${viriStrojni.length}`);
    for (const a of viriStrojni) console.log(`    ${a.tip} — ${a.naslov} ${a.ime ? `(${a.ime})` : ""}`);
    console.log(`  JSON-LD blokov na strani: ${napotki.ldJson}`);
    if (napotki.rssPovezave.length > 0) console.log(`  povezave, ki omenjajo rss/feed: ${napotki.rssPovezave.join(", ")}`);

    if (viriStrojni.length === 0 && sitemapi.length === 0) {
      console.log(
        `\nIZID: vir ne oglašuje nobenega strojnega kanala. Ostane branje seznamov — ` +
          `torej je edini vzvod KOLIČINA, ne način.`
      );
    } else {
      console.log(
        `\nIZID: obstaja vsaj en strojni kanal. Preveri ga, preden gradiš karkoli drugega: ` +
          `uraden kanal je vedno cenejši in stabilnejši od branja seznamov.`
      );
    }
  }
  await p2.close();
} catch (e) {
  console.error(`NAPAKA: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await ctx.close();
  await browser.close();
}

await new Promise((r) => setTimeout(r, 300));
