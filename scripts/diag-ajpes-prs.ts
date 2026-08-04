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
 * The d.o.o. page opens on the court-register view, which lacks region and
 * activity codes; the s.p. page opens on the richer PRS view. Find the link
 * that switches a d.o.o. to that same PRS view.
 */
async function main() {
  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");

  const search = await searchAjpes({ activity: "91.120" });
  const row = search.rows[2]; // ARHIV PNM d.o.o.
  console.log(`${row.name}\n${row.detailUrl}\n`);

  const { html, session } = await fetchAjpesAuthed(row.detailUrl, null);

  console.log("--- povezave na strani ---");
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,60}?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!/PRS|prs|Poslovni register|VPOGLED/i.test(label)) continue;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    console.log(`  ${m[1]}   -> "${label}"`);
  }
  for (const m of html.matchAll(/(?:href|onclick|location)\s*=\s*["']([^"']*(?:prs\.asp|Podjetje\.asp|prsData)[^"']*)["']/gi)) {
    console.log(`  js: ${m[1]}`);
  }

  // The s.p. page uses lowercase labels; try the same page id on the PRS view.
  const candidate = `${row.detailUrl}&p=1`;
  const probe = await fetchAjpesAuthed(candidate, session);
  const text = stripHtmlToText(probe.html);
  writeFileSync(process.argv[2] ?? "ajpes-prs.txt", text, "utf-8");
  console.log(`\n--- ${candidate} -> HTTP ${probe.status} ---`);
  for (const label of ["regija", "glavna dejavnost", "matična številka", "velikost RS", "občina"]) {
    console.log(`  vsebuje "${label}": ${text.includes(label)}`);
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
