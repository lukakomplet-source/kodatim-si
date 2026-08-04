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

/** Dumps a real AJPES company page so its parser can be written against it. */
async function main() {
  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");

  const search = await searchAjpes({ activity: process.argv[2] ?? "91.120" });
  const row = search.rows[Number(process.argv[3] ?? 2)];
  console.log(`${row.name}\n${row.detailUrl}\n`);

  const { html, status } = await fetchAjpesAuthed(row.detailUrl, null);
  const text = stripHtmlToText(html);
  writeFileSync(process.argv[4] ?? "ajpes-detail.txt", text, "utf-8");
  console.log(`HTTP ${status}, ${text.length} znakov besedila\n`);

  // Print the meaningful part: skip the shared header/nav boilerplate.
  const start = text.indexOf("Matična");
  console.log(JSON.stringify(text.slice(Math.max(0, start - 1500), start + 3000)));
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
