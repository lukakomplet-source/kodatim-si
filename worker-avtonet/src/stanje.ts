import "dotenv/config";
import { connect } from "./db.js";

/**
 * Is the collector actually collecting right now?
 *
 * A running process proves nothing — it can sit idle, or be stuck on a page that
 * never answers. What proves work is fresh rows: events arriving in the last
 * minute and the detail counter moving. This prints both, plus how long ago the
 * last event landed, so "it is running" and "it is progressing" are separate
 * answers.
 *
 *   npm run stanje
 */

function pred(iso: string | null): string {
  if (!iso) return "nikoli";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `pred ${s} s`;
  if (s < 3600) return `pred ${Math.round(s / 60)} min`;
  return `pred ${(s / 3600).toFixed(1)} h`;
}

async function main(): Promise<void> {
  const db = connect();

  const { data: r } = await db
    .from("avtonet_raziskave")
    .select("*")
    .order("zahtevano_ob", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: vseh } = await db.from("avtonet_oglasi").select("id", { count: "exact", head: true });
  const { count: zDetajli } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .not("detajl_zajet", "is", null);
  const { count: aktivnih } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("status", "aktiven");
  const { count: izginulih } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("status", "izginil");

  const { data: zadnji } = await db
    .from("avtonet_dogodki")
    .select("ob, vrsta, sporocilo")
    .order("id", { ascending: false })
    .limit(6);

  // Detail rows written in the last five minutes: the clearest proof of motion.
  const predPetimi = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: sveziDetajli } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .gte("detajl_zajet", predPetimi);

  const { data: zdravje } = await db
    .from("avtonet_zdravje")
    .select("heartbeat, stanje")
    .eq("id", "worker")
    .maybeSingle();

  console.log("=== BAZA ===");
  console.log(`  oglasov skupaj:        ${vseh}`);
  console.log(`  aktivnih:              ${aktivnih}`);
  console.log(`  izginulih:             ${izginulih}`);
  console.log(`  s podrobnostmi:        ${zDetajli}`);
  console.log(`  brez podrobnosti:      ${(aktivnih ?? 0) - (zDetajli ?? 0)}`);

  console.log("\n=== RAZISKAVA ===");
  if (!r) {
    console.log("  ni nobene raziskave");
  } else {
    const x = r as Record<string, unknown>;
    console.log(`  status:                ${x.status}`);
    console.log(`  faza:                  ${x.faza}`);
    console.log(`  poizvedb koncanih:     ${x.poizvedb_koncanih} (razdeljenih ${x.poizvedb_razdeljenih})`);
    console.log(`  strani:                ${x.strani_pregledanih}`);
    console.log(`  oglasov videnih:       ${x.oglasov_najdenih}`);
    console.log(`  novih:                 ${x.novih}`);
    console.log(`  podrobnosti:           ${x.detajlov_obdelanih} / ${x.detajlov_skupaj}`);
    console.log(`  napak:                 ${x.napak}`);
    console.log(`  posodobljena:          ${pred(x.updated_at as string)}`);
  }

  console.log("\n=== ALI SE PREMIKA ===");
  console.log(`  heartbeat workerja:    ${pred(zdravje?.heartbeat as string | null)} (${zdravje?.stanje ?? "?"})`);
  console.log(`  zadnji dogodek:        ${pred((zadnji?.[0]?.ob as string) ?? null)}`);
  console.log(`  podrobnosti v 5 min:   ${sveziDetajli}`);

  console.log("\n=== ZADNJI DOGODKI ===");
  for (const d of (zadnji ?? []).reverse()) {
    console.log(`  ${String(d.ob).slice(11, 19)} [${d.vrsta}] ${String(d.sporocilo).slice(0, 95)}`);
  }
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
