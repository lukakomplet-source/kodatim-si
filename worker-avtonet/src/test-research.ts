import "dotenv/config";
import { connect } from "./db.js";
import { claimResearch, finishResearch, requestResearch, saveProgress } from "./jobs.js";
import { runResearch, type Progress } from "./research.js";

/**
 * The whole manual path, end to end, in a couple of minutes instead of hours.
 *
 * It runs the REAL thing — real pages from avto.net at the real ten-second
 * delay, real writes to the real tables — but bounded to two result pages and
 * two adverts. That bound is the only difference from production, which is the
 * point: a mocked version of this test would prove nothing about the parts that
 * actually break.
 *
 * What it asserts, in order:
 *   1. a request from the dashboard is claimed by the worker exactly once
 *   2. progress is written into the row while the sweep runs (this is what the
 *      dashboard shows, so if it is wrong the screen lies)
 *   3. the checkpoint advances, and a resumed job starts AFTER it
 *   4. running the same pages twice creates no duplicate listings
 *   5. a cancellation is noticed by the running sweep
 *   6. phase 2 actually fills in detail fields
 *
 * Run with:  npm run test:research
 */

const OMEJITEV_STRANI = 2;
const OMEJITEV_DETAJLOV = 2;

// The bound has to be in place before research.ts is imported, since it reads
// these once at module load. Set here so the test needs no special .env.
process.env.AVTONET_MAX_PAGES = String(OMEJITEV_STRANI);
process.env.AVTONET_DETAIL_LIMIT = String(OMEJITEV_DETAJLOV);
// Any `tece` row counts as abandoned, so the resume path can be tested without
// waiting a quarter of an hour for one to go stale.
process.env.AVTONET_STALE_AFTER_MS = "0";

const napake: string[] = [];
const koraki: string[] = [];

function preveri(pogoj: boolean, opis: string): void {
  if (pogoj) {
    koraki.push(`  OK   ${opis}`);
  } else {
    napake.push(opis);
    koraki.push(`  NAPAKA  ${opis}`);
  }
  console.log(koraki[koraki.length - 1]);
}

function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>): void {
  console.log(`       [${level}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}`);
}

async function pocisti(db: ReturnType<typeof connect>, ids: string[]): Promise<void> {
  if (ids.length > 0) await db.from("avtonet_raziskave").delete().in("id", ids);
}

async function main(): Promise<void> {
  const db = connect();
  const nastale: string[] = [];

  // A leftover active row from an interrupted earlier test would block the
  // unique index and make this test fail for the wrong reason.
  const { data: ostanki } = await db
    .from("avtonet_raziskave")
    .select("id")
    .in("status", ["zahtevano", "tece"]);
  if (ostanki && ostanki.length > 0) {
    console.log(`Pocistim ${ostanki.length} nedokoncanih raziskav iz prejsnjega poskusa.\n`);
    await pocisti(db, ostanki.map((o) => o.id as string));
  }

  try {
    // ---- 1. request and claim -------------------------------------------
    console.log("1. Zahteva iz nadzorne plosce in prevzem");
    const zahteva = await requestResearch(db);
    preveri("id" in zahteva, "zahteva za raziskavo je zapisana");
    if (!("id" in zahteva)) return;
    nastale.push(zahteva.id);

    const drugaZahteva = await requestResearch(db);
    preveri(
      "zeTece" in drugaZahteva,
      "druga zahteva je zavrnjena, dokler prva ni koncana (en aktivni pregled)"
    );

    const job = await claimResearch(db);
    preveri(job !== null && job.id === zahteva.id, "worker prevzame zahtevo");
    preveri(job?.zadnja_stran === 0 && job?.nadaljevanje === false, "nova raziskava se zacne pri prvi strani");
    if (!job) return;

    const ponovniPrevzem = await claimResearch(db);
    // With STALE_AFTER_MS = 0 the row we just claimed looks abandoned, which is
    // precisely the resume path — so a second claim SHOULD return it, and its
    // checkpoint must be the one written so far (0, nothing swept yet).
    preveri(
      ponovniPrevzem !== null && ponovniPrevzem.nadaljevanje === true,
      "opuscena raziskava se prevzame kot nadaljevanje"
    );

    // ---- 2. run it, watching what lands in the row -----------------------
    console.log(`\n2. Pregled, omejen na ${OMEJITEV_STRANI} strani in ${OMEJITEV_DETAJLOV} oglasov`);
    const zapisi: Progress[] = [];
    const zaceto = Date.now();

    const progress = await runResearch(db, {
      startFromPage: 1,
      log,
      preskociIskanja: true,
      onProgress: async (p) => {
        zapisi.push({ ...p });
        await saveProgress(db, job.id, p);
      },
    });

    const minut = Math.round((Date.now() - zaceto) / 6000) / 10;
    console.log(`       (trajalo ${minut} min)`);

    preveri(progress.strani_pregledanih === OMEJITEV_STRANI, `pregledani sta ${OMEJITEV_STRANI} strani`);
    preveri(progress.oglasov_najdenih > 0, `najdeni so oglasi (${progress.oglasov_najdenih})`);
    preveri(progress.zadnja_stran === OMEJITEV_STRANI, `checkpoint je na strani ${OMEJITEV_STRANI}`);
    preveri(
      progress.pregled_popoln === false,
      "omejen pregled se NE steje za popoln (brez tega bi oznacil ves trg za izginul)"
    );
    preveri(progress.izginulih === 0, "pri nepopolnem pregledu se nic ne oznaci kot izginulo");
    preveri(progress.detajlov_obdelanih > 0, `2. faza je obdelala podrobnosti (${progress.detajlov_obdelanih})`);
    preveri(zapisi.length >= OMEJITEV_STRANI, `napredek se poroca sproti (${zapisi.length} zapisov)`);

    // ---- 3. the row the dashboard reads ---------------------------------
    console.log("\n3. Vrstica, iz katere bere nadzorna plosca");
    const { data: vrstica } = await db
      .from("avtonet_raziskave")
      .select("status, faza, strani_pregledanih, oglasov_najdenih, zadnja_stran, detajlov_obdelanih, pregled_popoln")
      .eq("id", job.id)
      .single();

    preveri(vrstica?.strani_pregledanih === progress.strani_pregledanih, "stevilo strani v bazi ustreza pregledu");
    preveri(vrstica?.zadnja_stran === progress.zadnja_stran, "checkpoint v bazi ustreza pregledu");
    preveri(vrstica?.faza === 2, "v bazi je zapisana zadnja faza");
    preveri(vrstica?.pregled_popoln === false, "zastavica 'pregled popoln' je v bazi pravilna");

    // ---- 4. resume starts after the checkpoint ---------------------------
    console.log("\n4. Nadaljevanje po checkpointu");
    const nadaljuj = await claimResearch(db);
    preveri(
      nadaljuj !== null && nadaljuj.zadnja_stran === OMEJITEV_STRANI && nadaljuj.nadaljevanje,
      `nadaljevanje se zacne pri strani ${OMEJITEV_STRANI + 1}, ne pri prvi`
    );

    // ---- 5. no duplicates from sweeping the same pages again -------------
    // `avtonet_id` is unique in the schema, so a duplicate cannot be inserted
    // at all — what has to be proved is that the second pass therefore does the
    // right thing instead of failing: it recognises what it already has and
    // updates it, and the row count only grows by adverts that are genuinely
    // new (a live market does add some between two runs minutes apart).
    console.log("\n5. Ponovni pregled istih strani: posodobi, ne podvaja");
    const { count: predZnova } = await db
      .from("avtonet_oglasi")
      .select("id", { count: "exact", head: true });
    const { count: posnetkiPred } = await db
      .from("avtonet_posnetki")
      .select("id", { count: "exact", head: true });

    const znova = await runResearch(db, {
      startFromPage: 1,
      log,
      preskociIskanja: true,
      onProgress: async (p) => {
        await saveProgress(db, job.id, p);
      },
    });

    const { count: poZnova } = await db.from("avtonet_oglasi").select("id", { count: "exact", head: true });
    const { count: posnetkiPo } = await db
      .from("avtonet_posnetki")
      .select("id", { count: "exact", head: true });
    const noviZapisi = (poZnova ?? 0) - (predZnova ?? 0);

    preveri(
      noviZapisi === znova.novih,
      `nove vrstice ustrezajo javljenim novim oglasom (${noviZapisi} = ${znova.novih})`
    );
    preveri(
      znova.posodobljenih > 0,
      `ze znane oglase posodobi namesto podvoji (${znova.posodobljenih} posodobljenih)`
    );
    // A snapshot per listing per run is the intended growth — it is the history
    // that makes "how long was this on the market" answerable at all.
    preveri(
      (posnetkiPo ?? 0) - (posnetkiPred ?? 0) === znova.oglasov_najdenih,
      `posnetek se doda za vsak videni oglas (${(posnetkiPo ?? 0) - (posnetkiPred ?? 0)})`
    );
    preveri(
      znova.detajlov_obdelanih <= znova.detajlov_skupaj,
      "2. faza ne obdela vec, kot je bilo v vrsti"
    );

    // ---- 6. cancellation is noticed -------------------------------------
    console.log("\n6. Preklic");
    await db.from("avtonet_raziskave").update({ status: "preklicano" }).eq("id", job.id);
    const seVeljavno = await saveProgress(db, job.id, progress);
    preveri(
      seVeljavno === false,
      "zapis napredka javi, da raziskava ni vec nasa - tako pregled izve za preklic"
    );

    await finishResearch(db, job.id, "koncano", progress);
    const { data: poPreklicu } = await db
      .from("avtonet_raziskave")
      .select("status")
      .eq("id", job.id)
      .single();
    preveri(poPreklicu?.status === "preklicano", "zakljucek ne prepise uporabnikovega preklica");

    // ---- 7. detail fields really arrived --------------------------------
    console.log("\n7. Podrobnosti v bazi");
    const { data: zDetajli } = await db
      .from("avtonet_oglasi")
      .select("avtonet_id, karoserija, oprema, prodajalec_naziv, dodatni_podatki, detajl_zajet")
      .not("detajl_zajet", "is", null)
      .limit(5);

    const vrstic = zDetajli ?? [];
    preveri(vrstic.length > 0, `oglasi z zajetimi podrobnostmi obstajajo (${vrstic.length})`);
    preveri(
      vrstic.some((v) => v.karoserija !== null),
      "karoserija je zapisana"
    );
    preveri(
      vrstic.some((v) => v.oprema !== null),
      "oprema je zapisana"
    );
    preveri(
      vrstic.some((v) => Object.keys((v.dodatni_podatki ?? {}) as Record<string, string>).length >= 8),
      "jsonb vrecka z dodatnimi podatki je polna"
    );
  } finally {
    await pocisti(db, nastale);
    console.log("\nTestne raziskave pocisceni.");
  }

  console.log("\n" + "-".repeat(60));
  if (napake.length > 0) {
    console.log(`TEST NI USPEL — ${napake.length} napak:`);
    for (const n of napake) console.log(`  - ${n}`);
    process.exitCode = 1;
  } else {
    console.log(`TEST USPESEN — ${koraki.length} preverjanj.`);
  }
}

main().catch((err) => {
  console.error("TEST NI USPEL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
