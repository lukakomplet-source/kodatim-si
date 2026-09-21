import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Ali je PROMET podjetja dosegljiv iz AJPES JOLP (javna objava letnih poročil)?
 *
 * Poslovni register (PRS) finančnih podatkov ne objavlja — to je v kodi
 * zapisano kot dejstvo (AJPES_NOT_PUBLISHED v providers/ajpes.ts). Promet je v
 * letnih poročilih, ki so v JOLP. Brez prijave JOLP pove: „Željenih podatkov
 * ne moremo prikazati. Prosimo, da se prijavite kot registrirani uporabnik.“
 *
 * Ta skript preveri troje in ničesar ne zajema v masi:
 *   1. ali naša obstoječa prijava (AJPES_USERNAME) do teh podatkov sploh pride,
 *   2. ali je na strani res promet in v kakšni obliki,
 *   3. kaj o samodejnem zajemu pravijo Pogoji uporabe.
 *
 *   npx tsx scripts/preveri-jolp.ts [maticna]
 */

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

function naloziOkolje(): void {
  const vsebina = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const vrstica of vsebina.split("\n")) {
    const t = vrstica.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[k]) process.env[k] = v;
  }
}

function besedilo(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main(): Promise<void> {
  naloziOkolje();
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");
  const maticna = process.argv[2] ?? "5381452000";
  const dir = process.env.SCRATCH ?? ".";

  // 1. Stran podjetja v JOLP, s prijavljeno sejo.
  const url = `https://www.ajpes.si/jolp/podjetje.asp?maticna=${maticna}`;
  const { html, status, session } = await fetchAjpesAuthed(url, null);
  writeFileSync(resolve(dir, "jolp-prijavljen.html"), html, "utf-8");
  const t = besedilo(html);
  const zahtevaPrijavo = /prijavite kot registrirani uporabnik/i.test(t);
  console.log(`1) JOLP s prijavo: HTTP ${status}, ${Math.round(html.length / 1024)} kB`);
  console.log(`   zahteva prijavo: ${zahtevaPrijavo}`);
  for (const izraz of ["Čisti prihodki od prodaje", "Prihodki", "prihodki", "Izkaz poslovnega izida", "Bilanca"]) {
    const i = t.indexOf(izraz);
    if (i > 0) {
      console.log(`   najden izraz "${izraz}": …${t.slice(Math.max(0, i - 80), i + 220)}…`);
      break;
    }
  }
  if (zahtevaPrijavo) console.log("   (podatkov NI — naš račun do JOLP nima dostopa ali je potrebna druga prijava)");

  // 2. Kaj pravijo pogoji uporabe.
  await new Promise((r) => setTimeout(r, 2000));
  const pogoji = await fetchAjpesAuthed("https://www.ajpes.si/jolp/pogoji.asp", session);
  const pt = besedilo(pogoji.html);
  console.log(`\n2) Pogoji uporabe: HTTP ${pogoji.status}, ${pt.length} znakov`);
  for (const izraz of ["samodejn", "avtomat", "robot", "masovn", "množičn", "prepoved", "komercialn", "ponovna uporaba"]) {
    const i = pt.toLowerCase().indexOf(izraz);
    if (i > 0) console.log(`   • "${izraz}": …${pt.slice(Math.max(0, i - 120), i + 200)}…`);
  }
  writeFileSync(resolve(dir, "jolp-pogoji.html"), pogoji.html, "utf-8");
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
