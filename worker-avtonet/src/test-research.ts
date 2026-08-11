import "dotenv/config";
import { connect } from "./db.js";
import { finishResearch, requestResearch, saveProgress } from "./jobs.js";
import { runResearch, type Progress } from "./research.js";

/**
 * The adaptive slicing path, end to end, on one brand.
 *
 * BMW is the probe the user asked for: it is over the source's cap, so a correct
 * system must detect that, split it, sweep every leaf slice, and deduplicate the
 * adverts that appear in more than one. The run is real — real pages, real
 * delays, real writes — bounded only to BMW and a few detail pages so it takes
 * minutes, not hours.
 *
 * What it asserts:
 *   1. slices were recorded for the run
 *   2. BMW itself was split (a "razdeljeno" slice exists) — proof the cap was hit
 *   3. leaf slices completed
 *   4. adverts were collected, and the DB has no duplicate avtonet_id
 *   5. phase 2 filled in detail for the few it was allowed
 *   6. progress reached the console row
 *
 *   npm run test:research
 */

// Bound BEFORE research.js reads these at run start.
process.env.AVTONET_ZNAMKE = "BMW";
process.env.AVTONET_DETAIL_LIMIT = "3";
process.env.AVTONET_STALE_AFTER_MS = "0";
// Keep it brisk but still polite for a test.
process.env.AVTONET_DELAY_LIST_MS = process.env.AVTONET_DELAY_LIST_MS ?? "2500";
process.env.AVTONET_DELAY_DETAIL_MS = process.env.AVTONET_DELAY_DETAIL_MS ?? "2500";

const napake: string[] = [];
function preveri(pogoj: boolean, opis: string): void {
  console.log(`  ${pogoj ? "OK  " : "NAPAKA"} ${opis}`);
  if (!pogoj) napake.push(opis);
}

function log(level: string, msg: string, extra?: Record<string, unknown>): void {
  if (level !== "info") console.log(`       [${level}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}`);
}

async function main(): Promise<void> {
  const db = connect();

  // Clear any leftover active research so the unique index does not block us.
  const { data: ostanki } = await db
    .from("avtonet_raziskave")
    .select("id")
    .in("status", ["zahtevano", "tece"]);
  if (ostanki && ostanki.length > 0) {
    await db.from("avtonet_raziskave").delete().in("id", ostanki.map((o) => o.id as string));
  }

  const zahteva = await requestResearch(db);
  if (!("id" in zahteva)) {
    console.log("Ni bilo mogoče ustvariti raziskave.");
    process.exitCode = 1;
    return;
  }
  const id = zahteva.id;
  await db.from("avtonet_raziskave").update({ status: "tece", zacetek: new Date().toISOString() }).eq("id", id);

  console.log("Zaganjam BMW sweep (samo BMW, 3 detajli). Traja nekaj minut.\n");
  const zaceto = Date.now();

  const progress = await runResearch(db, {
    raziskavaId: id,
    log,
    preskociIskanja: true,
    onProgress: async (p) => {
      await saveProgress(db, id, p);
    },
  });

  console.log(`\n(trajalo ${((Date.now() - zaceto) / 60000).toFixed(1)} min)\n`);

  console.log("1. Rezine");
  const { data: rezine } = await db
    .from("avtonet_rezine")
    .select("oznaka, status, cez_cap, najdenih, popolna")
    .eq("raziskava_id", id);
  const vse = rezine ?? [];
  preveri(vse.length > 1, `nastalo je več rezin (${vse.length})`);
  preveri(
    vse.some((r) => r.status === "razdeljeno" && r.cez_cap),
    "BMW je bil zaznan kot prevelik in razdeljen"
  );
  preveri(
    vse.some((r) => r.status === "koncano" && r.popolna),
    "vsaj ena končna rezina je popolna"
  );

  console.log("\n2. Zbrani oglasi");
  preveri(progress.oglasov_najdenih > 27, `zbranih bistveno več kot prej (${progress.oglasov_najdenih})`);
  preveri(progress.poizvedb_razdeljenih >= 1, `vsaj ena poizvedba razdeljena (${progress.poizvedb_razdeljenih})`);

  console.log("\n3. Deduplikacija (unique avtonet_id)");
  const { data: bmwji } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id")
    .eq("znamka", "BMW")
    .limit(5000);
  const idji = (bmwji ?? []).map((b) => b.avtonet_id as string);
  const unikatnih = new Set(idji).size;
  preveri(unikatnih === idji.length, `brez podvojenih ID-jev (${idji.length} vrstic, ${unikatnih} unikatnih)`);

  console.log("\n4. Podrobnosti (2. faza)");
  preveri(progress.detajlov_obdelanih >= 1, `obdelan vsaj en detail (${progress.detajlov_obdelanih})`);

  console.log("\n5. Napredek v bazi");
  const { data: vrstica } = await db
    .from("avtonet_raziskave")
    .select("poizvedb_koncanih, poizvedb_razdeljenih, oglasov_najdenih")
    .eq("id", id)
    .single();
  preveri(
    (vrstica?.oglasov_najdenih ?? 0) === progress.oglasov_najdenih,
    "števci v bazi ustrezajo pregledu"
  );

  await finishResearch(db, id, "koncano", progress);
  await db.from("avtonet_raziskave").delete().eq("id", id);
  console.log("\nTestna raziskava pospravljena.");

  console.log("\n" + "-".repeat(56));
  if (napake.length > 0) {
    console.log(`TEST NI USPEL — ${napake.length} napak:`);
    for (const n of napake) console.log(`  - ${n}`);
    process.exitCode = 1;
  } else {
    console.log("TEST USPESEN.");
  }
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
