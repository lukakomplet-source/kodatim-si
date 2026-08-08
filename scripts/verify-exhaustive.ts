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
 * Runs the real slicing algorithm headlessly and checks the only thing that
 * matters: does the number of companies collected equal the number AJPES says
 * exist?
 *
 *   npx tsx scripts/verify-exhaustive.ts 49.410            whole code
 *   npx tsx scripts/verify-exhaustive.ts 49.410 Ljubljana  one municipality
 */
// Type-only, so it is erased before the "server-only" shim above matters.
type Slice = import("@/lib/publicEnrichment/ajpesExhaustive").SearchSlice;
type Row = import("@/lib/publicEnrichment/ajpesSearch").AjpesSearchRow;

async function main() {
  const { runSlice, sliceLabel } = await import("@/lib/publicEnrichment/ajpesExhaustive");

  const activity = process.argv[2] ?? "49.410";
  const municipality = process.argv[3];

  const queue: Slice[] = [{ activity, status: "1", ...(municipality ? { municipality } : {}) }];
  const byUrl = new Map<string, Row>();
  const byRegNo = new Map<string, string>();
  const duplicates: string[] = [];
  const gaps: string[] = [];

  let expected: number | null = null;
  let queries = 0;
  const startedAt = Date.now();

  while (queue.length > 0) {
    const slice = queue.shift()!;
    const outcome = await runSlice(slice);
    queries += 1;

    // The first query is the yardstick: how many AJPES claims exist in total.
    if (expected === null) expected = outcome.total;

    for (const row of outcome.rows) {
      if (byUrl.has(row.detailUrl)) continue;
      byUrl.set(row.detailUrl, row);
      // A second identity check: two different pages for one matična would mean
      // the slices overlap in a way the URL dedupe hides.
      const reg = row.registrationNumber?.replace(/\D/g, "");
      if (reg) {
        if (byRegNo.has(reg)) duplicates.push(`${row.name} == ${byRegNo.get(reg)} (matična ${reg})`);
        else byRegNo.set(reg, row.name);
      }
    }

    if (outcome.children.length > 0) {
      queue.unshift(...outcome.children);
      console.log(
        `  ${sliceLabel(slice).padEnd(46)} ${String(outcome.total).padStart(5)} → razbijam na ${outcome.children.length}`
      );
    } else if (outcome.rows.length > 0) {
      console.log(
        `  ${sliceLabel(slice).padEnd(46)} ${String(outcome.rows.length).padStart(5)}   (skupaj ${byUrl.size})`
      );
    }
    if (outcome.gap) gaps.push(outcome.gap);
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  const missingPostal = [...byUrl.values()].filter((r) => !r.postalCode);

  console.log("\n=== IZID ===");
  console.log(`  iskano:            ${activity}${municipality ? ` · ${municipality}` : ""}`);
  console.log(`  AJPES javlja:      ${expected}`);
  console.log(`  zbranih:           ${byUrl.size}`);
  console.log(`  manjka:            ${expected === null ? "?" : expected - byUrl.size}`);
  console.log(`  podvojenih:        ${duplicates.length}`);
  console.log(`  brez poštne št.:   ${missingPostal.length}`);
  console.log(`  poizvedb:          ${queries} v ${seconds} s (${(seconds / queries).toFixed(1)} s/poizvedbo)`);
  console.log(`  vrzeli:            ${gaps.length ? gaps.join(" | ") : "brez"}`);
  for (const d of duplicates.slice(0, 5)) console.log(`    PODVOJEN: ${d}`);
  for (const r of missingPostal.slice(0, 5)) console.log(`    BREZ POŠTE: ${r.name} | ${r.address} | ${r.city}`);

  const ok = expected !== null && byUrl.size >= expected && duplicates.length === 0 && gaps.length === 0;
  console.log(`\n  ${ok ? "USPEH — zajeto je vse." : "NEPOPOLNO — glej zgoraj."}`);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
