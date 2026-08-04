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

/** How does AJPES page past MAXREC, and do filters combine? */
async function main() {
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");

  const url = "https://www.ajpes.si/prs/rezultati.asp?posta=2000&status=1&MAXREC=100";
  const res = await fetchAjpesAuthed(url, null);
  writeFileSync(process.argv[2] ?? "ajpes-results.html", res.html, "utf-8");

  // Anything that looks like a result count or a pager, with surrounding text.
  console.log("--- besedilo okoli 'zadet' / 'stran' ---");
  for (const m of res.html.matchAll(/[^<>]{0,90}(zadet|Stran|strani)[^<>]{0,90}/gi)) {
    const line = m[0].replace(/\s+/g, " ").trim();
    if (line.length > 6) console.log(`  ${line}`);
  }

  console.log("\n--- povezave, ki niso podjetje.asp (pager?) ---");
  const seen = new Set<string>();
  for (const m of res.html.matchAll(/<a[^>]+href="([^"]*rezultati\.asp[^"]*)"[^>]*>([\s\S]{0,40}?)<\/a>/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (seen.has(href)) continue;
    seen.add(href);
    console.log(`  ${href}   -> "${m[2].replace(/<[^>]+>/g, "").trim()}"`);
  }

  console.log("\n--- javascript pager klici ---");
  const calls = new Set<string>();
  for (const m of res.html.matchAll(/(?:href|onclick)="javascript:([^"]{0,120})"/gi)) calls.add(m[1]);
  for (const c of [...calls].slice(0, 15)) console.log(`  ${c}`);

  // Do activity and area combine into one narrower search?
  const combo = "https://www.ajpes.si/prs/rezultati.asp?dejavnost=91.120&posta=1000&status=1&MAXREC=100";
  const res2 = await fetchAjpesAuthed(combo, res.session);
  const start = res2.html.indexOf('id="tableRezultati"');
  const rows = start === -1 ? [] : [...res2.html.slice(start, res2.html.indexOf("</table>", start)).matchAll(/<a href="(podjetje\.asp\?[^"]+)">([^<]*)<\/a>/gi)];
  console.log(`\n--- dejavnost + posta ---\n${combo}\n  tabela: ${start !== -1} | vrstic: ${rows.length}`);
  for (const r of rows.slice(0, 5)) console.log(`    ${r[2].trim()}`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
