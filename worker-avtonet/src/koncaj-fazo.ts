import "dotenv/config";
import { connect } from "./db.js";

/**
 * Drains the last handful of adverts that phase 2 can never process, so a
 * finished run actually ends instead of grinding on them forever.
 *
 * Seen live (12. 8. 2026): the detail phase reached 53.702/53.708 and then
 * looped on ~6 adverts every few seconds for 21 h, each failing with "Empty or
 * invalid json" — because the batch loop re-fetches whatever is still missing,
 * and these never succeed, so `detajlov_obdelanih` never reaches `_skupaj` and
 * the loop never breaks. (The code fix for the loop is separate; this clears
 * the adverts that are already stuck under the running worker.)
 *
 * Marks them as ATTEMPTED (detajl_zajet = now) so they leave the queue and the
 * phase completes. These are ~6 of 53.708 (0,01 %); accepting no detail for
 * them is the right trade against an endless grind.
 *
 *   npm run koncaj:fazo              (pokaže, koliko je zataknjenih)
 *   npm run koncaj:fazo -- --zares   (jih označi kot obdelane)
 */

async function main(): Promise<void> {
  const zares = process.argv.includes("--zares");
  const db = connect();

  // 1) End the running research cleanly. The worker reads the row status at
  // every batch (shouldStop → saveProgress sees status != 'tece'), so this is
  // what actually breaks it out of the loop — draining the queue alone is
  // whack-a-mole while a live worker keeps hitting transient write errors.
  const { data: tekoce } = await db
    .from("avtonet_raziskave")
    .select("id, status")
    .in("status", ["zahtevano", "tece"])
    .limit(5);
  const aktivne = (tekoce ?? []) as { id: string; status: string }[];
  if (aktivne.length > 0) {
    console.log(`Tekočih raziskav: ${aktivne.length} (${aktivne.map((r) => r.status).join(", ")})`);
    if (zares) {
      const { error: pErr } = await db
        .from("avtonet_raziskave")
        .update({ status: "preklicano", konec: new Date().toISOString() })
        .in("status", ["zahtevano", "tece"]);
      if (pErr) throw new Error(`Preklic raziskave ni uspel: ${pErr.message}`);
      console.log("Raziskava preklicana — worker bo 2. fazo končal ob naslednjem paketu.");
    }
  } else {
    console.log("Nobena raziskava ne teče.");
  }

  const { data, error } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id, znamka, model, naziv")
    .eq("status", "aktiven")
    .is("detajl_zajet", null)
    .limit(200);
  if (error) throw new Error(error.message);

  const zataknjeni = (data ?? []) as { avtonet_id: string; znamka: string | null; model: string | null; naziv: string | null }[];
  console.log(`Oglasov brez podrobnosti (zataknjenih): ${zataknjeni.length}`);
  for (const o of zataknjeni.slice(0, 20)) {
    console.log(`  ${o.avtonet_id}  ${o.znamka ?? "?"} ${o.model ?? ""}  — ${(o.naziv ?? "").slice(0, 50)}`);
  }

  if (zataknjeni.length === 0) {
    console.log("Nič za urediti — 2. faza je zaključena.");
    return;
  }
  // A safety ceiling: if there are suddenly hundreds, this is NOT the
  // end-of-run tail and marking them all done would throw away real work.
  if (zataknjeni.length > 100) {
    console.log("OPOZORILO: preveč manjkajočih (>100) — to ni rep na koncu kroga. Ne označujem, preveri ročno.");
    return;
  }

  if (!zares) {
    console.log("\nSamo prikaz. Za dejansko zaključitev dodaj --zares.");
    return;
  }

  const ids = zataknjeni.map((o) => o.avtonet_id);
  const patch: Record<string, unknown> = { detajl_zajet: new Date().toISOString() };
  // If the v2 column exists, also lift the version so a NEW-code worker does
  // not re-queue them. Done in a second update that ignores a missing column.
  const { error: upErr } = await db.from("avtonet_oglasi").update(patch).in("avtonet_id", ids);
  if (upErr) throw new Error(upErr.message);
  await db.from("avtonet_oglasi").update({ detajl_verzija: 2 }).in("avtonet_id", ids).then(
    () => {},
    () => {}
  );

  console.log(`\nOznačenih kot obdelanih: ${ids.length}. 2. faza se bo zdaj zaključila (naslednji paket bo prazen).`);
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
