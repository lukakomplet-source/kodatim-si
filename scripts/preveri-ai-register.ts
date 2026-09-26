import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * AI iskanje po registru na pravih primerih: kaj AI razume in kaj baza vrne.
 *   npx tsx scripts/preveri-ai-register.ts "frčade Vojnik" "keramika Vojnik"
 */
type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const M = Module as unknown as { _load: ModuleLoadFn };
const izvirni = M._load;
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return izvirni.call(this, request, ...rest);
};
for (const v of readFileSync(resolve(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const t = v.trim();
  const i = t.indexOf("=");
  if (!t || t.startsWith("#") || i < 0) continue;
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
}

async function main(): Promise<void> {
  const { aiFiltriRegistra } = await import("@/lib/registerAi");
  const { filtriIz, poizvedbaIz, preberiPaket } = await import("@/lib/registerPodjetij");
  for (const vprasanje of process.argv.slice(2)) {
    const z = Date.now();
    const f = await aiFiltriRegistra(vprasanje);
    const q = new URLSearchParams();
    if (f.skd.length) q.set("skdv", f.skd.join(","));
    if (f.besede.length) q.set("beseda", f.besede.join(","));
    if (f.kraj) q.set("kraj", f.kraj);
    const filtri = filtriIz((k) => q.get(k) ?? "");
    const p = await preberiPaket(filtri, null, true);
    console.log(`\n=== ${vprasanje}  (${Date.now() - z} ms)`);
    console.log(`AI: skd=${f.skd.join(",")} besede=${f.besede.join(",")} kraj=${f.kraj} | ${f.razlaga}`);
    console.log(`URL: ${poizvedbaIz(filtri)}`);
    console.log(`zadetkov: ${p.skupaj}`);
    for (const v of p.vrstice.slice(0, 12)) console.log(`  ${v.skd} | ${v.kraj} | ${v.naziv}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
