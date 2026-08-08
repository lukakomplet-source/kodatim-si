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
 * Is the HEAD-with-count probe trustworthy at all? Run both query shapes
 * against a table that certainly does not exist, and against ui_state.
 */
async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  for (const table of ["zagotovo_neobstojeca_tabela_xyz", "ui_state"]) {
    const head = await admin.from(table).select("*", { head: true, count: "exact" }).limit(1);
    const get = await admin.from(table).select("*").limit(1);
    console.log(`${table}:`);
    console.log(`  HEAD+count: ${head.error ? `NAPAKA ${head.error.code}` : `ok (count=${head.count})`}`);
    console.log(`  GET:        ${get.error ? `NAPAKA ${get.error.code}` : `ok (${get.data?.length ?? 0} vrstic)`}`);
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
