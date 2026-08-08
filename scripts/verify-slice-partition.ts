import { readFileSync } from "node:fs";
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
 * Two questions, answered against the live service rather than assumed:
 *
 *  1. Which filters does the PRS search form actually offer? (is there an
 *     "obcina" field, or only "posta"/"naselje"?)
 *  2. Is slicing a lossless partition? Take a code small enough that AJPES
 *     returns it complete, slice it by postal code, and check the union of the
 *     slices is exactly the unsliced result — no one lost, no one doubled.
 */
async function main() {
  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");

  // --- 1. form fields -----------------------------------------------------
  const form = await fetchAjpesAuthed("https://www.ajpes.si/prs/", null);
  const names = new Set<string>();
  for (const m of form.html.matchAll(/<(input|select)[^>]*\bname="([^"]+)"[^>]*>/gi)) {
    names.add(`${m[1].toLowerCase()}:${m[2]}`);
  }
  console.log("--- polja iskalnega obrazca ---");
  console.log([...names].sort().join("\n"));

  // --- 2. partition test --------------------------------------------------
  const code = process.argv[2] ?? "91.120";
  const whole = await searchAjpes({ activity: code });
  console.log(`\n--- ${code}: totalFound=${whole.totalFound} vrnjenih=${whole.rows.length} omejeno=${whole.limited} ---`);

  const posts = [...new Set(whole.rows.map((r) => r.postalCode).filter(Boolean))] as string[];
  console.log(`različnih poštnih številk med zadetki: ${posts.length}`);

  const union = new Map<string, string>();
  const dupes: string[] = [];
  for (const posta of posts) {
    const slice = await searchAjpes({ activity: code, postalCode: posta });
    for (const row of slice.rows) {
      if (union.has(row.detailUrl)) dupes.push(`${row.name} (${posta})`);
      union.set(row.detailUrl, posta);
    }
    console.log(`  posta=${posta}: ${slice.rows.length} (total=${slice.totalFound})`);
  }

  const wholeUrls = new Set(whole.rows.map((r) => r.detailUrl));
  const missing = [...wholeUrls].filter((u) => !union.has(u));
  const extra = [...union.keys()].filter((u) => !wholeUrls.has(u));

  console.log(`\nbrez rezanja: ${wholeUrls.size}`);
  console.log(`unija rezin:  ${union.size}`);
  console.log(`izgubljenih:  ${missing.length}`);
  console.log(`odvečnih:     ${extra.length}`);
  console.log(`podvojenih:   ${dupes.length}${dupes.length ? ` -> ${dupes.join(", ")}` : ""}`);
  for (const u of missing) {
    const row = whole.rows.find((r) => r.detailUrl === u)!;
    console.log(`  IZGUBLJEN: ${row.name} | posta=${row.postalCode} | kraj=${row.city}`);
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
