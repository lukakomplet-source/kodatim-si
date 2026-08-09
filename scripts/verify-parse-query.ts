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

/** The exact code path behind "Razčleni opis", on the user's own example. */
async function main() {
  const { parseLeadQuery } = await import("@/lib/promocije/parseQuery");

  const cases = [
    "rabim podizvajalce za polaganje keramike, Celje z okolico, s.p., promet pod 50.000 €",
    "gradbena podjetja v Savinjski regiji z nad 500k prometa, d.o.o.",
    "avtoprevozniki okolica Maribora",
  ] as const;

  for (const query of cases) {
    const parsed = await parseLeadQuery(query, "podizvajalci");
    console.log(`\n„${query}“`);
    if (!parsed.ok) {
      console.log(`  NAPAKA: ${parsed.error}`);
      continue;
    }
    const p = parsed.profile;
    console.log(`  SKD:        ${p.skdCodes.join(", ") || "—"}`);
    console.log(`  občine (${p.municipalities?.length ?? 0}): ${(p.municipalities ?? []).slice(0, 10).join(", ")}${(p.municipalities?.length ?? 0) > 10 ? " …" : ""}`);
    console.log(`  promet:     ${p.revenueMinEur ?? "—"} do ${p.revenueMaxEur ?? "—"} €`);
    console.log(`  oblika:     ${p.legalForm ?? "—"}`);
    console.log(`  besede:     ${p.keywords.join(", ")}`);
    console.log(`  povzetek:   ${p.summary}`);
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
