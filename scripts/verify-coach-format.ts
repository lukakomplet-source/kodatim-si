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

/** The user's real question, through the real path: is the answer structured and tool-aware? */
async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { coachAnswer } = await import("@/lib/salesCoach");
  const admin = createAdminClient();

  const result = await coachAnswer(admin, "kak bi se zdaj lotil tega da najdem podizvajalce za mene b2b", {
    cardone: true,
    context: "rabim za kompletno gradbeništvo domače mojstre za keramiko, okolica Celja",
  });

  console.log("=== ODGOVOR ===\n");
  console.log(result.answer);
  console.log("\n=== PREVERBE ===");
  const hasBold = /\*\*.+?\*\*/.test(result.answer);
  const numberedLines = (result.answer.match(/^\d{1,2}[.)]\s/gm) ?? []).length;
  const mentionsTools = /(lead skrejp|tematsk|kampanj|lead intelligence)/i.test(result.answer);
  console.log(`krepko (**...**):        ${hasBold ? "DA" : "NE"}`);
  console.log(`oštevilčenih vrstic:     ${numberedLines}`);
  console.log(`omenja orodja aplikacije: ${mentionsTools ? "DA" : "NE"}`);
  console.log(`outOfScope: ${result.outOfScope}`);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
