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

/** Does the ui_state table exist, and is anything actually being saved to it? */
async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ui_state")
    .select("key, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    console.log(`NAPAKA: ${error.message}`);
    console.log(`koda: ${error.code ?? "?"}`);
    return;
  }
  console.log(`tabela ui_state obstaja — ${data?.length ?? 0} zapisov (najnovejši najprej):`);
  for (const row of data ?? []) console.log(`  ${row.key}  (${row.updated_at})`);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
