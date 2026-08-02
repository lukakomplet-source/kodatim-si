// Strict verification run for the Public Company Enrichment Engine, matching
// the required report format: per-provider SUCCESS/FAILED + reason, then per
// company filled/missing fields with source+confidence, completion %, and
// conflicts. Runs OUTSIDE Next.js (plain Node via tsx) against the real
// pipeline — real AJPES login, real Firecrawl, real OpenAI, real Supabase
// writes. Creates real leads in the live database (left in place on purpose).
//
// Run with: npx tsx scripts/verify-enrichment.ts

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
  const path = resolve(process.cwd(), ".env.local");
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    console.warn("Warning: could not read .env.local");
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
  "ARHIVARKA, Irena Bauman s.p.",
  "ARS",
  "DEJAN VIDOVIĆ s.p.",
  "E-ARHIV d.o.o.",
];

type ProviderDebugEntry = {
  id: string;
  label: string;
  executed: boolean;
  url: string | null;
  fieldsFound: string[];
  fieldsMissing: { field: string; reason: string }[];
  durationMs: number;
  error: string | null;
};
type Debug = {
  providers: ProviderDebugEntry[];
  conflicts: { field: string; values: { source: string; value: string }[] }[];
};
type FieldMeta = { value: string; source: string; confidence: number; checked_at: string };

function classify(entry: ProviderDebugEntry | undefined): { status: "SUCCESS" | "FAILED" | "SKIPPED"; reason: string } {
  if (!entry) return { status: "SKIPPED", reason: "provider not present in this run" };
  if (!entry.executed) return { status: "SKIPPED", reason: "shouldRun() false — precondition not met (e.g. no website known yet)" };
  if (entry.error) return { status: "FAILED", reason: `error — ${entry.error}` };
  if (entry.fieldsFound.length > 0) return { status: "SUCCESS", reason: `${entry.fieldsFound.length} fields found (${entry.fieldsFound.join(", ")})` };
  // All missing entries share the same reason string for a given run (see orchestrator.ts) —
  // this is where AJPES's "PRIJAVA NI USPELA" / "AMBIGUOUS MATCH" / "ni bilo mogoče najti" surfaces.
  const reason = entry.fieldsMissing[0]?.reason ?? "no fields found";
  return { status: "FAILED", reason };
}

async function main() {
  const missingEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FIRECRAWL_API_KEY", "OPENAI_API_KEY"].filter(
    (k) => !process.env[k]
  );
  if (missingEnv.length > 0) {
    console.error(`Missing env vars: ${missingEnv.join(", ")}`);
    process.exit(1);
  }
  if (!process.env.AJPES_USERNAME || !process.env.AJPES_PASSWORD) {
    console.error("AJPES_USERNAME/AJPES_PASSWORD not set — cannot verify AJPES login.");
    process.exit(1);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { runLeadEnrichment } = await import("@/lib/enrichment/orchestrator");

  const admin = createAdminClient();

  for (const company of TEST_COMPANIES) {
    console.log(`\n${"#".repeat(72)}\n${company}\n${"#".repeat(72)}`);

    const { data: lead, error: insertError } = await admin
      .from("intel_leads")
      .insert({ company_name: company, enrichment_status: "queued", custom_fields: { test_run: "verify_enrichment" } })
      .select("id")
      .single();

    if (insertError || !lead) {
      console.error(`  Insert failed: ${insertError?.message}`);
      continue;
    }

    await runLeadEnrichment(lead.id, admin, null);

    const { data: finalLead } = await admin.from("intel_leads").select("*").eq("id", lead.id).single();
    if (!finalLead) {
      console.error("  Could not read lead after enrichment.");
      continue;
    }

    const meta = (finalLead.enrichment_meta ?? {}) as Record<string, unknown>;
    const debug = meta.__public_enrichment_debug as Debug | undefined;
    const byId = new Map((debug?.providers ?? []).map((p) => [p.id, p] as const));

    const ajpesResult = classify(byId.get("ajpes"));
    console.log(`\nAJPES\n${ajpesResult.status}`);
    console.log(`Reason: ${ajpesResult.reason}\n`);

    const companywallResult = classify(byId.get("companywall"));
    console.log(`CompanyWall\n${companywallResult.status}`);
    console.log(`Reason: ${companywallResult.reason}\n`);

    const biziResult = classify(byId.get("bizi"));
    console.log(`Bizi\n${biziResult.status}`);
    console.log(`Reason: ${biziResult.reason}\n`);

    const websiteEntry = byId.get("public_website");
    const websiteStatus = websiteEntry?.executed && websiteEntry.url ? "SUCCESS" : "FAILED";
    const websiteReason = websiteEntry?.executed
      ? websiteEntry.url
        ? `official site: ${websiteEntry.url}`
        : "no website known for this lead yet"
      : "no website known for this lead yet (primary pipeline discovery found none / was filtered as untrustworthy)";
    console.log(`Website\n${websiteStatus}`);
    console.log(`Reason: ${websiteReason}\n`);

    const aiStatus = websiteEntry?.executed && websiteEntry.fieldsFound.length > 0 ? "SUCCESS" : "FAILED";
    const aiReason = websiteEntry?.executed
      ? websiteEntry.fieldsFound.length > 0
        ? `extracted ${websiteEntry.fieldsFound.length} fields from ${websiteEntry.url}`
        : "site reached but no extractable fields"
      : "no website to analyze";
    console.log(`AI\n${aiStatus}`);
    console.log(`Reason: ${aiReason}\n`);

    const googleResult = classify(byId.get("google_search"));
    console.log(`Google\n${googleResult.status}`);
    console.log(`Reason: ${googleResult.reason}\n`);

    // Filled / missing fields with source, confidence, updated_at
    const filled: string[] = [];
    const missing: string[] = [];
    const allFieldsSeen = new Set<string>();
    for (const p of debug?.providers ?? []) {
      for (const f of p.fieldsFound) allFieldsSeen.add(f);
      for (const m of p.fieldsMissing) allFieldsSeen.add(m.field);
    }
    console.log("Filled fields:");
    for (const field of [...allFieldsSeen].sort()) {
      const m = meta[field] as FieldMeta | undefined;
      if (m?.value) {
        filled.push(field);
        console.log(`  ${field.padEnd(24)} value="${m.value}" source=${m.source} confidence=${m.confidence}% updated_at=${m.checked_at}`);
      }
    }
    console.log("Missing fields:");
    for (const field of [...allFieldsSeen].sort()) {
      const m = meta[field] as FieldMeta | undefined;
      if (!m?.value) {
        missing.push(field);
        console.log(`  ${field}`);
      }
    }

    const completion = Math.round((filled.length / (filled.length + missing.length || 1)) * 100);
    console.log(`\nCompletion %: ${completion}%`);

    console.log("\nConflicts:");
    if (!debug?.conflicts.length) {
      console.log("  none");
    } else {
      for (const c of debug.conflicts) {
        console.log(`  ${c.field}: ${c.values.map((v) => `${v.source}="${v.value}"`).join(" vs ")}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Script crashed:", err);
  process.exit(1);
});
