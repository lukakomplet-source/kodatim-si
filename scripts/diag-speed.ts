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
 * Where does the time actually go for one company? Runs each provider on its
 * own with a stopwatch, against a company that is NOT in the cache, so the
 * numbers reflect a real first-time scrape rather than a cache hit.
 */
async function main() {
  const company = process.argv[2] ?? "AGRO POSAVJE, predelava in trgovina, d.o.o.";
  const city = process.argv[3];

  const { ajpesProvider } = await import("@/lib/publicEnrichment/providers/ajpes");
  const { companyWallProvider } = await import("@/lib/publicEnrichment/providers/companywall");
  const { biziProvider } = await import("@/lib/publicEnrichment/providers/bizi");
  const { quickComplete } = await import("@/lib/publicEnrichment/quickComplete");

  const lead = { company_name: company, address_city: city ?? null, custom_fields: {} } as never;

  console.log(`Podjetje: ${company}\n`);
  for (const provider of [ajpesProvider, companyWallProvider, biziProvider]) {
    const started = Date.now();
    const result = await provider.run(lead);
    const ms = Date.now() - started;
    const requests = result.diagnostics?.requests?.length ?? 0;
    console.log(
      `${provider.label.padEnd(14)} ${String(ms).padStart(7)} ms   ${requests} zahtevkov   ${result.note.slice(0, 70)}`
    );
  }

  const started = Date.now();
  const full = await quickComplete(company, city, {});
  console.log(`\nCELOTEN quickComplete: ${Date.now() - started} ms`);
  console.log(`  spletna stran: ${full.website ?? "—"}`);
  for (const p of full.providerNotes) console.log(`  ${p.label.padEnd(28)} ${p.note.slice(0, 90)}`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
