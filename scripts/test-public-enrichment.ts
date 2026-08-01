// Standalone verification script for the Public Company Enrichment Engine v2.
// Runs OUTSIDE Next.js (plain Node via tsx) so it can hit the real pipeline —
// real Firecrawl/OpenAI/AJPES calls, real Supabase writes — without needing
// an authenticated admin browser session. Creates real leads in the live
// database (left in place on purpose so results are visible in the real
// admin UI) and prints a debug report + completion % per company.
//
// Run with: npx tsx scripts/test-public-enrichment.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

// The app's server-only-tagged files (admin.ts, orchestrator.ts, etc.) import
// the "server-only" package, which unconditionally throws — Next.js aliases
// it to a no-op at bundle time, but this script runs as plain Node with no
// bundler. Stub it out for this process only; doesn't touch app code or
// Next's real build.
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
    console.warn("Opozorilo: .env.local ni bilo mogoče prebrati.");
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

const TEST_COMPANIES = [
  "ARHIV PNM d.o.o.",
  "ARHIVARKA Irena Bauman s.p.",
  "ARS",
  "DEJAN VIDOVIĆ S.P.",
  "E-ARHIV d.o.o.",
];

async function main() {
  const missingEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FIRECRAWL_API_KEY", "OPENAI_API_KEY"].filter(
    (k) => !process.env[k]
  );
  if (missingEnv.length > 0) {
    console.error(`Manjkajoče spremenljivke okolja: ${missingEnv.join(", ")}`);
    process.exit(1);
  }
  if (!process.env.AJPES_USERNAME || !process.env.AJPES_PASSWORD) {
    console.warn("Opozorilo: AJPES_USERNAME/AJPES_PASSWORD nista nastavljena — AJPES provider bo preskočen.\n");
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { runLeadEnrichment } = await import("@/lib/enrichment/orchestrator");
  const { computeCompletionPercent } = await import("@/lib/publicEnrichment/types");

  const admin = createAdminClient();
  const results: { company: string; leadId: string; completion: number }[] = [];

  for (const company of TEST_COMPANIES) {
    console.log(`\n${"=".repeat(70)}\n${company}\n${"=".repeat(70)}`);

    const { data: lead, error: insertError } = await admin
      .from("intel_leads")
      .insert({
        company_name: company,
        enrichment_status: "queued",
        custom_fields: { test_run: "public_enrichment_v2" },
      })
      .select("id")
      .single();

    if (insertError || !lead) {
      console.error(`  Vstavljanje leada ni uspelo: ${insertError?.message}`);
      continue;
    }

    console.log(`  Lead ID: ${lead.id}`);
    const startedAt = Date.now();
    await runLeadEnrichment(lead.id, admin, null);
    console.log(`  Pipeline končan v ${Math.round((Date.now() - startedAt) / 1000)}s`);

    const { data: finalLead } = await admin.from("intel_leads").select("*").eq("id", lead.id).single();
    if (!finalLead) {
      console.error("  Leada po obogatitvi ni bilo mogoče prebrati.");
      continue;
    }

    const debug = (finalLead.enrichment_meta as Record<string, unknown> | null)?.__public_enrichment_debug as
      | { providers: { id: string; label: string; executed: boolean; url: string | null; fieldsFound: string[]; fieldsMissing: { field: string; reason: string }[]; durationMs: number; error: string | null }[]; conflicts: { field: string; values: { source: string; value: string }[] }[] }
      | undefined;

    console.log("\n  --- Debug poročilo (Public Enrichment Engine) ---");
    if (!debug) {
      console.log("  Ni debug podatkov (runPublicEnrichment se morda ni izvedel).");
    } else {
      for (const p of debug.providers) {
        const status = !p.executed ? "preskočen" : p.error ? `napaka: ${p.error}` : "izveden";
        console.log(`  [${p.label}] ${status}${p.url ? ` — ${p.url}` : ""} (${p.durationMs}ms)`);
        if (p.fieldsFound.length) console.log(`      najdeno: ${p.fieldsFound.join(", ")}`);
        if (p.fieldsMissing.length) {
          console.log(`      manjka: ${p.fieldsMissing.map((m) => `${m.field} (${m.reason})`).join("; ")}`);
        }
      }
      if (debug.conflicts.length) {
        console.log("\n  Konflikti med viri:");
        for (const c of debug.conflicts) {
          console.log(`    ${c.field}: ${c.values.map((v) => `${v.source}="${v.value}"`).join(" vs ")}`);
        }
      } else {
        console.log("\n  Konflikti med viri: brez.");
      }
    }

    const completion = computeCompletionPercent(
      finalLead as unknown as Record<string, unknown>,
      finalLead.custom_fields as Record<string, unknown> | null
    );
    console.log(`\n  Zapolnjenost: ${completion}%`);
    results.push({ company, leadId: lead.id, completion });
  }

  console.log(`\n${"=".repeat(70)}\nPOVZETEK\n${"=".repeat(70)}`);
  for (const r of results) {
    console.log(`  ${r.company.padEnd(35)} ${String(r.completion).padStart(3)}%   (${r.leadId})`);
  }
  console.log("\nTestni leadi so ostali v bazi (custom_fields.test_run = \"public_enrichment_v2\") za pregled v UI.");
}

main().catch((err) => {
  console.error("Skript je padel z nepričakovano napako:", err);
  process.exit(1);
});
