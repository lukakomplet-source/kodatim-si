/**
 * Full end-to-end verification through the REAL production path:
 *   insert leads -> enqueue -> spawn the standalone worker -> worker claims
 *   and runs AJPES -> CompanyWall -> Bizi -> Website -> Google -> saves.
 *
 * Then prints the per-company report: provider status, filled/missing fields
 * with source + confidence, completion %, conflicts and execution time.
 *
 *   npx tsx scripts/verify-e2e.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import Module from "node:module";

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const M = Module as unknown as { _load: ModuleLoadFn };
const orig = M._load;
M._load = function (this: unknown, req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return orig.call(this, req, ...rest);
};

function loadEnvLocal(): void {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
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
const TAG = "verify_e2e";

type ProviderDebugEntry = {
  id: string;
  label: string;
  executed: boolean;
  url: string | null;
  fieldsFound: string[];
  fieldsMissing: { field: string; reason: string }[];
  durationMs: number;
  error: string | null;
  note?: string;
  outcome?: "ok" | "skipped" | "error";
  requests?: { url: string; status: number | null; ok: boolean; note?: string }[];
  parserChecks?: { element: string; found: boolean; detail?: string }[];
};
type Debug = {
  providers: ProviderDebugEntry[];
  conflicts: { field: string; values: { source: string; value: string }[] }[];
};
type FieldMeta = { value: string; source: string; confidence: number; checked_at: string };

const STATUS_LABEL: Record<string, string> = { ok: "SUCCESS", skipped: "SKIPPED", error: "FAILED" };

function runWorker(): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn("npx", ["tsx", "scripts/worker.ts"], {
      env: {
        ...process.env,
        ENRICHMENT_MAX_JOBS: String(TEST_COMPANIES.length),
        WORKER_CONCURRENCY: "2",
        WORKER_IDLE_SLEEP_MS: "1000",
        // Force real work: don't let the freshness cache short-circuit the run.
        ENRICHMENT_REFRESH_DAYS: "0",
      },
      shell: true,
    });
    child.stdout.on("data", (d) => process.stdout.write(`  [worker] ${d}`));
    child.stderr.on("data", (d) => process.stderr.write(`  [worker!] ${d}`));
    child.on("close", (code) => (code === 0 ? res() : rej(new Error(`worker exited ${code}`))));
  });
}

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { enqueueLeads, queueCounts } = await import("@/lib/enrichment/queue");
  const admin = createAdminClient();

  // Clean any leftovers from an earlier run of this script.
  const { data: old } = await admin.from("intel_leads").select("id").eq("custom_fields->>test_run", TAG);
  if (old?.length) {
    await admin.from("enrichment_jobs").delete().in("lead_id", old.map((o) => o.id));
    await admin.from("intel_leads").delete().in("id", old.map((o) => o.id));
  }

  console.log(`Vstavljam ${TEST_COMPANIES.length} testnih podjetij …`);
  const { data: leads } = await admin
    .from("intel_leads")
    .insert(TEST_COMPANIES.map((company_name) => ({
      company_name,
      enrichment_status: "queued",
      custom_fields: { test_run: TAG },
    })))
    .select("id, company_name");

  const queued = await enqueueLeads(admin, (leads ?? []).map((l) => l.id as string));
  console.log(`V vrsto uvrščenih: ${queued}`);
  console.log(`Vrsta pred zagonom: ${JSON.stringify(await queueCounts(admin))}\n`);

  console.log("Zaganjam pravi worker proces (npm run worker) …\n");
  const startedAt = Date.now();
  await runWorker();
  const totalMs = Date.now() - startedAt;

  console.log(`\nVrsta po zagonu: ${JSON.stringify(await queueCounts(admin))}`);
  console.log(`Skupni čas: ${(totalMs / 1000).toFixed(1)}s\n`);

  let totalCompletion = 0;
  for (const lead of leads ?? []) {
    const { data: f } = await admin.from("intel_leads").select("*").eq("id", lead.id).single();
    const meta = (f?.enrichment_meta ?? {}) as Record<string, unknown>;
    const debug = meta.__public_enrichment_debug as Debug | undefined;
    const byId = new Map((debug?.providers ?? []).map((p) => [p.id, p] as const));

    console.log("#".repeat(74));
    console.log(`${lead.company_name}`);
    console.log("#".repeat(74));

    for (const [id, label] of [
      ["ajpes", "AJPES"],
      ["companywall", "CompanyWall"],
      ["bizi", "Bizi"],
      ["public_website", "Website + AI"],
      ["google_search", "Google (fallback)"],
    ] as const) {
      const p = byId.get(id);
      const status = p ? STATUS_LABEL[p.outcome ?? "skipped"] ?? "SKIPPED" : "SKIPPED";
      console.log(
        `\n${label}: ${status}   [${p?.executed ? "zagnan" : "ni bil zagnan"}${p?.durationMs ? `, ${(p.durationMs / 1000).toFixed(1)}s` : ""}]`
      );
      console.log(`  ${p?.note ?? "(ni podatka)"}`);
      for (const r of p?.requests ?? []) {
        console.log(
          `  → ${r.status === null ? "brez odgovora" : `HTTP ${r.status}`}  ${r.url}${r.note ? `  (${r.note})` : ""}`
        );
      }
      for (const c of p?.parserChecks ?? []) {
        console.log(`  ${c.found ? "✓" : "✗"} ${c.element}${c.detail ? ` — ${c.detail}` : ""}`);
      }
      if (p?.fieldsFound.length) console.log(`  zapolnjeno: ${p.fieldsFound.join(", ")}`);
      for (const m of p?.fieldsMissing ?? []) {
        console.log(`  ✗ ${m.field.padEnd(26)} ${m.reason}`);
      }
    }

    const seen = new Set<string>();
    for (const p of debug?.providers ?? []) {
      for (const x of p.fieldsFound) seen.add(x);
      for (const m of p.fieldsMissing) seen.add(m.field);
    }
    const filled: string[] = [];
    const missing: string[] = [];
    console.log("\nZapolnjena polja (vir / zanesljivost):");
    for (const field of [...seen].sort()) {
      const m = meta[field] as FieldMeta | undefined;
      if (m?.value) {
        filled.push(field);
        console.log(`  ${field.padEnd(22)} "${m.value}"  ← ${m.source} (${m.confidence}%)`);
      }
    }
    console.log("Manjkajoča polja:");
    console.log(`  ${[...seen].sort().filter((x) => !(meta[x] as FieldMeta | undefined)?.value).join(", ") || "(nobenega)"}`);
    for (const field of [...seen].sort()) if (!(meta[field] as FieldMeta | undefined)?.value) missing.push(field);

    const completion = Math.round((filled.length / (filled.length + missing.length || 1)) * 100);
    totalCompletion += completion;
    console.log(`\nZapolnjenost: ${completion}%`);
    console.log(`Status leada: ${f?.enrichment_status}   napaka: ${f?.enrichment_error ?? "(brez)"}`);

    console.log("Konflikti med viri:");
    if (!debug?.conflicts.length) console.log("  (brez)");
    else for (const c of debug.conflicts) console.log(`  ${c.field}: ${c.values.map((v) => `${v.source}="${v.value}"`).join(" ≠ ")}`);
    console.log();
  }

  const { data: jobs } = await admin
    .from("enrichment_jobs")
    .select("status, lead_id")
    .in("lead_id", (leads ?? []).map((l) => l.id as string));
  console.log("=".repeat(74));
  console.log(`POVPREČNA ZAPOLNJENOST: ${Math.round(totalCompletion / (leads?.length || 1))}%`);
  console.log(`Opravila: ${JSON.stringify((jobs ?? []).reduce((a, j) => ({ ...a, [j.status]: (a[j.status] ?? 0) + 1 }), {} as Record<string, number>))}`);
  console.log(`Skupni čas za ${leads?.length} podjetij: ${(totalMs / 1000).toFixed(1)}s`);
  console.log("=".repeat(74));
  console.log("\nTestni leadi ostajajo v bazi (custom_fields.test_run = 'verify_e2e').");
}

main().catch((e) => {
  console.error("verify-e2e crashed:", e);
  process.exit(1);
});
