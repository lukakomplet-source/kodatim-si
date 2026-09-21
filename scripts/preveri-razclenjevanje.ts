import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

/**
 * Koliko časa iskanje kontaktov BLOKIRA dogodkovno zanko?
 *
 * 19. 9. 2026: zahteva na /api/interno/podjetja/splet se je vrnila po 105 s,
 * čeprav ima pot rok 60 s — časovnik torej ni mogel pasti, ker je bila zanka
 * ves ta čas zasedena s sinhronim delom. Osumljenci so `stripHtmlToText`
 * (veriga 16 zamenjav čez cel dokument) in regexa za e-pošto in telefon, ki
 * tečeta nad SUROVIM HTML-jem — tudi nad vdelanimi slikami data:base64.
 *
 *   npx tsx scripts/preveri-razclenjevanje.ts [url]
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

async function main(): Promise<void> {
  naloziOkolje();
  const { providerFetch, preberiTeloOmejeno } = await import("@/lib/publicEnrichment/httpClient");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
  const { najdiEposto, najdiTelefon } = await import("@/lib/publicEnrichment/registerSplet");

  const url = process.argv[2] ?? "https://dbk.si";
  const host = new URL(url).hostname;

  const t0 = Date.now();
  const r = await providerFetch("website", url, { maxAttempts: 1, timeoutMs: 8_000 });
  const { besedilo: html } = await preberiTeloOmejeno(r);
  console.log(`prenos ${url}: ${Date.now() - t0} ms, ${Math.round(html.length / 1024)} kB`);
  const base64 = (html.match(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/gi) ?? []).length;
  console.log(`vdelanih data:base64 vsebin: ${base64}`);

  // Vsak korak posebej — merimo, kaj drži zanko.
  const t1 = Date.now();
  const besedilo = stripHtmlToText(html);
  console.log(`stripHtmlToText: ${Date.now() - t1} ms -> ${Math.round(besedilo.length / 1024)} kB`);

  const t2 = Date.now();
  const eposta = najdiEposto([html], host);
  console.log(`najdiEposto (surov HTML): ${Date.now() - t2} ms -> ${eposta ?? "—"}`);

  const t3 = Date.now();
  const telefon = najdiTelefon([html]);
  console.log(`najdiTelefon (surov HTML): ${Date.now() - t3} ms -> ${telefon ?? "—"}`);

  // Koliko bi stalo, ce bi base64 prej odstranili.
  const t4 = Date.now();
  const ocisceno = html.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, " ");
  const cisMs = Date.now() - t4;
  const t5 = Date.now();
  najdiEposto([ocisceno], host);
  const epostaCista = Date.now() - t5;
  const t6 = Date.now();
  najdiTelefon([ocisceno]);
  const telefonCist = Date.now() - t6;
  console.log(
    `PO ODSTRANITVI base64 (${cisMs} ms, ${Math.round(ocisceno.length / 1024)} kB): e-posta ${epostaCista} ms, telefon ${telefonCist} ms`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
