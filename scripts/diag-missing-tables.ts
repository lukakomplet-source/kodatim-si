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
 * Which application tables actually exist in the live database?
 *
 * A real GET per table, never HEAD+count: PostgREST answers a HEAD probe with
 * 200 (count=null) even for a table that does not exist, which made the first
 * version of this script report every table as present. PGRST205 on a GET is
 * the only trustworthy "missing" signal.
 */
const TABLES = [
  "ui_state",
  "intel_leads",
  "enrichment_jobs",
  "public_enrichment_cache",
  "sales_knowledge",
  "promo_campaigns",
  "promo_themed_campaigns",
];

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*").limit(1);
    console.log(`${table.padEnd(28)} ${error ? `MANJKA (${error.code ?? error.message})` : "obstaja"}`);
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
