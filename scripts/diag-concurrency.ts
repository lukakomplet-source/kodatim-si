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
 * Reproduces the "Hitro" setting: several companies scraped at once, which is
 * when rows started failing in the UI. Prints, per company, exactly which
 * source failed and with what message.
 */
async function main() {
  const activity = process.argv[2] ?? "01.110";
  const concurrency = Number(process.argv[3] ?? 5);

  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { quickComplete } = await import("@/lib/publicEnrichment/quickComplete");

  const search = await searchAjpes({ activity });
  const batch = search.rows.slice(0, concurrency);
  console.log(`${batch.length} podjetij hkrati (dejavnost ${activity})\n`);

  const started = Date.now();
  const results = await Promise.all(
    batch.map(async (row) => {
      const t0 = Date.now();
      try {
        const result = await quickComplete(row.shortName || row.name, row.city ?? undefined, {
          known: { vat_id: row.vatId, registration_number: row.registrationNumber },
          ajpesDetailUrl: row.detailUrl,
        });
        return { row, result, ms: Date.now() - t0, crash: null as string | null };
      } catch (err) {
        return {
          row,
          result: null,
          ms: Date.now() - t0,
          crash: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        };
      }
    })
  );

  console.log(`Skupno ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  for (const { row, result, ms, crash } of results) {
    console.log(`=== ${row.name.slice(0, 60)} (${(ms / 1000).toFixed(1)}s) ===`);
    if (crash) {
      console.log(`  SESUTJE: ${crash}`);
      continue;
    }
    const filled = Object.keys(result!.fields).length;
    console.log(`  ${filled} polj`);
    for (const p of result!.providerNotes) console.log(`    ${p.label.padEnd(28)} ${p.note.slice(0, 110)}`);
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
