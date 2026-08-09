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

/** One real authenticated search — the definitive "does AJPES login work" check. */
async function main() {
  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const t0 = Date.now();
  const result = await searchAjpes({ activity: "91.120" });
  console.log(`prijava + iskanje: OK (${Date.now() - t0} ms)`);
  console.log(`91.120 -> ${result.rows.length} podjetij (AJPES javlja ${result.totalFound})`);
  console.log(`prvo: ${result.rows[0]?.name ?? "—"}`);
}
main().catch((e) => {
  console.error(`NAPAKA: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
