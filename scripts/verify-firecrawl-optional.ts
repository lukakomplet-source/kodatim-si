// Verifies the explicit requirement: Firecrawl must be OPTIONAL. Simulates a
// real Firecrawl failure (the account is already out of credits — confirmed
// live earlier this session, 402 "Insufficient credits") against a lead
// whose website is a known JS-shell page (web.telegram.org — server-renders
// ~12 chars of text, forcing the website provider's Firecrawl fallback path).
// Confirms: AJPES/CompanyWall/Bizi still populate normally, the lead still
// saves successfully, and the website step degrades cleanly instead of
// failing the whole pipeline.
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
  // Confirm Firecrawl is genuinely unavailable right now (not assuming — verifying).
  const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
    body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
  });
  console.log(`Firecrawl live status check: HTTP ${fcRes.status} (${fcRes.status === 402 ? "confirmed out of credits" : "unexpected — may have credits now"})`);

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { runPublicEnrichment } = await import("@/lib/publicEnrichment/orchestrator");
  const admin = createAdminClient();

  const companyName = "ARHIV PNM d.o.o.";
  const { data: lead, error } = await admin
    .from("intel_leads")
    .insert({
      company_name: companyName,
      website: "https://web.telegram.org/", // known JS-shell page — forces the Firecrawl fallback path
      enrichment_status: "queued",
      custom_fields: { test_run: "verify_firecrawl_optional" },
    })
    .select("id")
    .single();

  if (error || !lead) {
    console.error("Insert failed:", error?.message);
    process.exit(1);
  }
  console.log(`\nLead created: ${lead.id}`);

  await runPublicEnrichment(lead.id, admin, null);

  const { data: finalLead } = await admin.from("intel_leads").select("*").eq("id", lead.id).single();
  if (!finalLead) {
    console.error("FAIL: lead could not be read back after enrichment — pipeline may have crashed the save.");
    process.exit(1);
  }

  const meta = (finalLead.enrichment_meta ?? {}) as Record<string, unknown>;
  const debug = meta.__public_enrichment_debug as {
    providers: { id: string; label: string; executed: boolean; fieldsFound: string[]; error: string | null }[];
  } | undefined;

  console.log("\n=== Provider results ===");
  for (const p of debug?.providers ?? []) {
    console.log(`  [${p.label}] executed=${p.executed} fieldsFound=${p.fieldsFound.length} error=${p.error ?? "none"}`);
  }

  console.log("\n=== Saved lead fields (from AJPES/CompanyWall/Bizi) ===");
  console.log("  director:", finalLead.director ?? meta.director ?? "(check custom_fields)");
  console.log("  vat_id:", finalLead.vat_id);
  console.log("  custom_fields.registration_number:", (finalLead.custom_fields as Record<string, string>)?.registration_number);

  const ajpesEntry = debug?.providers.find((p) => p.id === "ajpes");
  const companywallEntry = debug?.providers.find((p) => p.id === "companywall");
  const biziEntry = debug?.providers.find((p) => p.id === "bizi");
  const websiteEntry = debug?.providers.find((p) => p.id === "public_website");

  const ajpesOk = (ajpesEntry?.fieldsFound.length ?? 0) > 0;
  const registryDataPresent = Boolean(finalLead.vat_id) || Boolean((finalLead.custom_fields as Record<string, string>)?.registration_number);
  const leadSaved = Boolean(finalLead.id) && finalLead.enrichment_status !== "error";

  console.log("\n=== VERDICT ===");
  console.log(`AJPES data collected despite Firecrawl being down: ${ajpesOk ? "YES" : "NO"}`);
  console.log(`Registry data (VAT/registration number) actually saved to the lead: ${registryDataPresent ? "YES" : "NO"}`);
  console.log(`Lead saved successfully (not stuck in error status): ${leadSaved ? "YES" : "NO"}`);
  console.log(`Website step note: ${JSON.stringify(websiteEntry)}`);
  console.log(`CompanyWall executed: ${companywallEntry?.executed}, Bizi executed: ${biziEntry?.executed}`);

  await admin.from("intel_leads").delete().eq("id", lead.id);
  console.log("\n(test lead cleaned up)");
}

main().catch((e) => {
  console.error("Script crashed — this itself would be a FAIL for the 'never break the pipeline' requirement:", e);
  process.exit(1);
});
