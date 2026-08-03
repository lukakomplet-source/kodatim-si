/**
 * Verifies the durable queue's correctness properties without doing any real
 * enrichment (no provider requests): atomic claiming, no double-processing
 * across concurrent workers, retry backoff, crash recovery via the reaper,
 * and idempotent enqueue.
 *
 * Requires supabase/migration_enrichment_queue.sql to be applied.
 *
 *   npx tsx scripts/verify-queue.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const TEST_TAG = "verify_queue";
const N_LEADS = 40;

function assert(label: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const queue = await import("@/lib/enrichment/queue");
  const admin = createAdminClient();

  // Fail fast with a clear message if the migration hasn't been run.
  const probe = await admin.from("enrichment_jobs").select("id").limit(1);
  if (probe.error) {
    console.error(
      `\nenrichment_jobs ni na voljo (${probe.error.message}).\n` +
        "Poženi supabase/migration_enrichment_queue.sql v Supabase SQL Editorju in zaženi znova.\n"
    );
    process.exit(1);
  }

  console.log(`\nPripravljam ${N_LEADS} testnih leadov …`);
  const rows = Array.from({ length: N_LEADS }, (_, i) => ({
    company_name: `QUEUE TEST ${Date.now()}-${i}`,
    enrichment_status: "queued",
    custom_fields: { test_run: TEST_TAG },
  }));
  const { data: leads, error: insErr } = await admin.from("intel_leads").insert(rows).select("id");
  if (insErr || !leads) {
    console.error("Vstavljanje testnih leadov ni uspelo:", insErr?.message);
    process.exit(1);
  }
  const leadIds = leads.map((l) => l.id as string);

  try {
    console.log("\n=== 1. Enqueue je idempotenten ===");
    const first = await queue.enqueueLeads(admin, leadIds);
    const second = await queue.enqueueLeads(admin, leadIds);
    assert("prvi enqueue ustvari opravila", first === N_LEADS, `${first} opravil`);
    assert("ponovni enqueue ne podvaja", second === 0, `${second} dodanih ob drugem klicu`);

    console.log("\n=== 2. Dva hkratna workerja si ne podvajata dela ===");
    // The real test of FOR UPDATE SKIP LOCKED: both claim at the same instant.
    const [claimA, claimB] = await Promise.all([
      queue.claimJobs(admin, "worker-A", 20),
      queue.claimJobs(admin, "worker-B", 20),
    ]);
    const idsA = new Set(claimA.map((j) => j.id));
    const idsB = new Set(claimB.map((j) => j.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    assert("brez prekrivanja med workerjema", overlap.length === 0, `A=${idsA.size} B=${idsB.size} prekrivanj=${overlap.length}`);
    assert("skupaj prevzeta vsa opravila", idsA.size + idsB.size === N_LEADS, `${idsA.size + idsB.size}/${N_LEADS}`);

    const leadOverlap = new Set(claimA.map((j) => j.lead_id));
    const dupLeads = claimB.filter((j) => leadOverlap.has(j.lead_id));
    assert("noben lead ni prevzet dvakrat", dupLeads.length === 0, `${dupLeads.length} podvojenih leadov`);

    console.log("\n=== 3. Prevzem poveča attempts in zaklene ===");
    const sample = claimA[0];
    assert("attempts=1 po prvem prevzemu", sample.attempts === 1, `attempts=${sample.attempts}`);
    assert("locked_by je nastavljen", sample.locked_by === "worker-A", `locked_by=${sample.locked_by}`);
    assert("status je running", sample.status === "running", `status=${sample.status}`);

    console.log("\n=== 4. Prazna vrsta ne vrne ničesar ===");
    const empty = await queue.claimJobs(admin, "worker-C", 10);
    assert("ni več opravil za prevzem", empty.length === 0, `${empty.length} prevzetih`);

    console.log("\n=== 5. Neuspeh → ponovni poskus z zamikom ===");
    await queue.failJob(admin, sample, "simulirana napaka");
    const { data: afterFail } = await admin
      .from("enrichment_jobs")
      .select("status, scheduled_at, last_error, attempts")
      .eq("id", sample.id)
      .single();
    assert("vrnjen v pending", afterFail?.status === "pending", `status=${afterFail?.status}`);
    assert("napaka je shranjena", afterFail?.last_error === "simulirana napaka", `${afterFail?.last_error}`);
    const scheduledInFuture = afterFail && new Date(afterFail.scheduled_at).getTime() > Date.now() + 1000;
    assert("zamik je v prihodnosti", Boolean(scheduledInFuture), `scheduled_at=${afterFail?.scheduled_at}`);

    const notYet = await queue.claimJobs(admin, "worker-D", 5);
    assert("zamaknjeno opravilo se še ne prevzame", !notYet.some((j) => j.id === sample.id), `prevzetih=${notYet.length}`);

    console.log("\n=== 6. Izčrpani poskusi → failed ===");
    const exhausted = { ...sample, attempts: sample.max_attempts };
    await queue.failJob(admin, exhausted, "zadnji poskus");
    const { data: afterExhaust } = await admin
      .from("enrichment_jobs")
      .select("status")
      .eq("id", sample.id)
      .single();
    assert("označeno kot failed", afterExhaust?.status === "failed", `status=${afterExhaust?.status}`);

    console.log("\n=== 7. Okrevanje po sesutju workerja (reaper) ===");
    // Simulate a worker that died holding jobs: backdate its heartbeat.
    const stuckIds = claimB.slice(0, 5).map((j) => j.id);
    await admin
      .from("enrichment_jobs")
      .update({ locked_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
      .in("id", stuckIds);
    const reaped = await queue.reapStaleJobs(admin, 10);
    assert("reaper je vrnil zamrznjena opravila", reaped >= stuckIds.length, `${reaped} vrnjenih`);
    const { data: recovered } = await admin
      .from("enrichment_jobs")
      .select("id, status, locked_by")
      .in("id", stuckIds);
    const allPending = (recovered ?? []).every((j) => j.status === "pending" && j.locked_by === null);
    assert("zamrznjena opravila so spet pending in odklenjena", allPending, `${(recovered ?? []).map((j) => j.status).join(",")}`);

    const reclaimed = await queue.claimJobs(admin, "worker-E", 5);
    assert("drug worker jih lahko prevzame", reclaimed.length === 5, `${reclaimed.length} prevzetih`);

    console.log("\n=== 8. Graceful shutdown vrne opravila ===");
    await queue.releaseJobs(admin, reclaimed.map((j) => j.id));
    const { data: released } = await admin
      .from("enrichment_jobs")
      .select("status")
      .in("id", reclaimed.map((j) => j.id));
    assert("vsa vrnjena v pending", (released ?? []).every((j) => j.status === "pending"), `${(released ?? []).map((j) => j.status).join(",")}`);

    console.log("\n=== 9. Števci vrste ===");
    const counts = await queue.queueCounts(admin);
    console.log(`  pending=${counts.pending} running=${counts.running} done=${counts.done} failed=${counts.failed}`);
    assert("števci so na voljo", typeof counts.pending === "number", "ok");
  } finally {
    console.log("\nČistim testne podatke …");
    await admin.from("enrichment_jobs").delete().in("lead_id", leadIds);
    await admin.from("intel_leads").delete().in("id", leadIds);
    console.log("Počiščeno.");
  }
}

main().catch((e) => {
  console.error("verify-queue crashed:", e);
  process.exit(1);
});
