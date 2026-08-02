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

async function main() {
  const { companyWallProvider } = await import("@/lib/publicEnrichment/providers/companywall");
  for (const name of ["ARHIV PNM d.o.o.", "ARHIVARKA, Irena Bauman s.p.", "ARS", "DEJAN VIDOVIĆ s.p.", "E-ARHIV d.o.o."]) {
    const lead = { company_name: name, custom_fields: {} } as never;
    const start = Date.now();
    const result = await companyWallProvider.run(lead);
    console.log(`\n=== ${name} (${Date.now() - start}ms) ===`);
    console.log("note:", result.note);
    console.log("fields:", JSON.stringify(result.fields, null, 2));
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
