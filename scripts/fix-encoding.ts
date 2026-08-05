// Repairs leads whose text was stored double-encoded ("PrevozniÅ¡tvo in
// transport" instead of "Prevozništvo in transport").
//
// The cause was the CSV import handing raw bytes to SheetJS, which falls back
// to codepage 1252 for text files and so read UTF-8 as Latin-1. That is fixed;
// this repairs the rows already written that way.
//
//   npx tsx scripts/fix-encoding.ts           <- dry run, changes nothing
//   npx tsx scripts/fix-encoding.ts --apply   <- writes the repairs

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
 * Mojibake is a high-Latin-1 letter followed by a UTF-8 continuation byte
 * rendered as a character — "Å¡", "Ä", "Å¾". Slovenian text never
 * contains those pairs, so the test does not fire on correct data.
 */
const MOJIBAKE = /[À-ß][-¿]/;

/** Returns the repaired string, or null when there is nothing to repair. */
function repair(value: unknown): string | null {
  if (typeof value !== "string" || !MOJIBAKE.test(value)) return null;
  const fixed = Buffer.from(value, "latin1").toString("utf8");
  // A failed round-trip leaves replacement characters — leave such a value
  // alone rather than replacing bad text with worse text.
  if (fixed === value || fixed.includes("�")) return null;
  return fixed;
}

const TEXT_COLUMNS = [
  "company_name",
  "industry",
  "address_street",
  "address_city",
  "address_region",
  "address_country",
  "contact_person",
  "notes",
];

async function main() {
  const apply = process.argv.includes("--apply");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data, error } = await admin.from("intel_leads").select("*");
  if (error) throw new Error(`Branje leadov ni uspelo: ${error.message}`);

  const leads = (data ?? []) as Record<string, unknown>[];
  console.log(`${leads.length} leadov v bazi.\n`);

  let touched = 0;
  for (const lead of leads) {
    const updates: Record<string, unknown> = {};

    for (const column of TEXT_COLUMNS) {
      const fixed = repair(lead[column]);
      if (fixed !== null) updates[column] = fixed;
    }

    const custom = lead.custom_fields as Record<string, unknown> | null;
    if (custom && typeof custom === "object") {
      const fixedCustom: Record<string, unknown> = { ...custom };
      let customChanged = false;
      for (const [key, value] of Object.entries(custom)) {
        const fixed = repair(value);
        if (fixed !== null) {
          fixedCustom[key] = fixed;
          customChanged = true;
        }
      }
      if (customChanged) updates.custom_fields = fixedCustom;
    }

    if (Object.keys(updates).length === 0) continue;
    touched++;

    console.log(`${String(lead.company_name)}`);
    for (const [key, value] of Object.entries(updates)) {
      if (key === "custom_fields") {
        console.log(`  custom_fields -> popravljene vrednosti`);
        continue;
      }
      console.log(`  ${key}:\n    prej:  ${String(lead[key])}\n    potem: ${String(value)}`);
    }

    if (apply) {
      const { error: updateError } = await admin.from("intel_leads").update(updates).eq("id", lead.id as string);
      if (updateError) console.error(`  NAPAKA pri shranjevanju: ${updateError.message}`);
    }
    console.log();
  }

  console.log(
    touched === 0
      ? "Ni najdenih pokvarjenih zapisov."
      : apply
        ? `Popravljenih ${touched} leadov.`
        : `${touched} leadov bi bilo popravljenih. Za dejanski popravek poženite z --apply.`
  );
}

main().catch((err) => {
  console.error("Script crashed:", err);
  process.exit(1);
});
