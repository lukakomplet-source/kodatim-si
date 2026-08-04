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
 * What can AJPES's PRS search actually be asked for? Prints the real search
 * form's inputs and selects so the scrape page is built against the live
 * parameters instead of guessed ones.
 */
async function main() {
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");

  const formUrl = "https://www.ajpes.si/prs/default.asp";
  const { html, status, session } = await fetchAjpesAuthed(formUrl, null);
  console.log(`${formUrl} -> HTTP ${status}, ${html.length} znakov\n`);
  writeFileSync(process.argv[2] ?? "ajpes-form.html", html, "utf-8");

  console.log("--- INPUT polja ---");
  for (const m of html.matchAll(/<input[^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/name="([^"]+)"/i)?.[1];
    const type = tag.match(/type="([^"]+)"/i)?.[1] ?? "text";
    if (name && type !== "hidden") console.log(`  ${name.padEnd(24)} type=${type}`);
  }

  console.log("\n--- SELECT polja (prvih 6 možnosti) ---");
  for (const m of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const options = [...m[2].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</gi)]
      .slice(0, 6)
      .map((o) => `${o[1]}=${o[2].trim()}`);
    const total = [...m[2].matchAll(/<option/gi)].length;
    console.log(`  ${m[1].padEnd(24)} (${total} možnosti): ${options.join(" | ")}`);
  }

  console.log("\n--- FORM action ---");
  for (const m of html.matchAll(/<form[^>]*>/gi)) console.log(`  ${m[0].slice(0, 200)}`);

  // Does a plain activity-code search actually return the results table?
  const probe = "https://www.ajpes.si/prs/rezultati.asp?sifDej=91.120&status=1";
  const res = await fetchAjpesAuthed(probe, session);
  const rows = [...res.html.matchAll(/<a href="(podjetje\.asp\?[^"]+)">([^<]*)<\/a>/gi)];
  console.log(`\n--- POSKUS iskanja po dejavnosti ---\n${probe} -> HTTP ${res.status}`);
  console.log(`  tabela najdena: ${res.html.includes('id="tableRezultati"')}`);
  console.log(`  vrstic: ${rows.length}`);
  for (const r of rows.slice(0, 5)) console.log(`    ${r[2].trim()}`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
