import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

function loadEnvLocal(): void {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

/**
 * Dumps the flattened text of a provider page to a file, so parser regexes are
 * written against what the page actually contains instead of a guess.
 *
 *   npx tsx scripts/diag-page-raw.ts <providerId> <url> <outFile>
 */
async function main() {
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
  const { providerFetch } = await import("@/lib/publicEnrichment/httpClient");

  const provider = (process.argv[2] ?? "bizi") as Parameters<typeof providerFetch>[0];
  const url = process.argv[3] ?? "https://www.bizi.si/ARHIV-PNM-D-O-O/";
  const out = process.argv[4] ?? "page-dump.txt";

  const res = await providerFetch(provider, url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" },
  });
  const text = stripHtmlToText(await res.text());
  writeFileSync(out, text, "utf-8");
  console.log(`${url} -> HTTP ${res.status} (final ${res.url}), ${text.length} chars -> ${out}`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
