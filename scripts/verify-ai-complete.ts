// Verification for the "AI dopolni vse" button, running the EXACT code path
// the button uses (src/lib/publicEnrichment/quickComplete.ts) against the live
// registries — real AJPES login, real CompanyWall/Bizi HTML, real website
// fetch. Writes nothing to the database.
//
// Prints, per company: every filled field with its source, every empty field
// with the precise reason it is empty, the notes description, and completion %.
//
// Run with: npx tsx scripts/verify-ai-complete.ts

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
  const path = resolve(process.cwd(), ".env.local");
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    console.warn("Warning: could not read .env.local");
    return;
  }
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

const TEST_COMPANIES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "ARHIV PNM d.o.o.",
      "ARHIVARKA, Irena Bauman s.p.",
      "ARS",
      "DEJAN VIDOVIĆ s.p.",
      "E-ARHIV d.o.o.",
    ];

async function main() {
  if (!process.env.AJPES_USERNAME || !process.env.AJPES_PASSWORD) {
    console.error("AJPES_USERNAME/AJPES_PASSWORD not set — cannot verify AJPES login.");
    process.exit(1);
  }

  const { quickComplete, QUICK_COMPLETE_FIELDS } = await import("@/lib/publicEnrichment/quickComplete");

  let totalFilled = 0;
  let totalPossible = 0;

  for (const company of TEST_COMPANIES) {
    console.log(`\n${"#".repeat(76)}\n${company}\n${"#".repeat(76)}`);

    const startedAt = Date.now();
    const result = await quickComplete(company);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log("\nViri:");
    for (const p of result.providerNotes) console.log(`  ${p.label.padEnd(22)} ${p.note}`);

    console.log(`\nSpletna stran: ${result.website ?? "— ni najdena"}`);
    console.log(`Opis (Opombe): ${result.description ?? "— ni opisa"}`);

    const filled = QUICK_COMPLETE_FIELDS.filter((f) => result.fields[f]);
    const empty = QUICK_COMPLETE_FIELDS.filter((f) => !result.fields[f]);

    console.log(`\nZapolnjena polja (${filled.length}):`);
    for (const f of filled) {
      console.log(`  ${f.padEnd(22)} = ${String(result.fields[f]).slice(0, 60).padEnd(60)} [${result.sources[f] ?? "?"}]`);
    }

    console.log(`\nPrazna polja (${empty.length}) — z razlogom:`);
    for (const f of empty) console.log(`  ${f.padEnd(22)} ${result.fieldNotes[f] ?? "(brez razloga — NAPAKA V DIAGNOSTIKI)"}`);

    const pct = Math.round((filled.length / QUICK_COMPLETE_FIELDS.length) * 100);
    totalFilled += filled.length;
    totalPossible += QUICK_COMPLETE_FIELDS.length;
    console.log(`\nIzpolnjenost: ${pct}%   Čas: ${elapsed}s`);

    const noReason = empty.filter((f) => !result.fieldNotes[f]);
    if (noReason.length > 0) console.log(`!! Polja brez razloga: ${noReason.join(", ")}`);
  }

  console.log(`\n${"=".repeat(76)}`);
  console.log(`SKUPAJ: ${totalFilled}/${totalPossible} polj = ${Math.round((totalFilled / totalPossible) * 100)}%`);
}

main().catch((err) => {
  console.error("Script crashed:", err);
  process.exit(1);
});
