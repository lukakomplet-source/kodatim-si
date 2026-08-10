import "dotenv/config";
import { connect } from "./db.js";

/**
 * Undoes the false disappearances written by a truncated test sweep.
 *
 * A partial sweep used to mark everything it had not seen as gone. The
 * collector no longer does that, but the rows it already wrote would sit in
 * the history forever and poison exactly the number this system exists to
 * produce — days on the market. Cheap to repair now, impossible to
 * distinguish from a real disappearance later.
 *
 *   npm run cleanup:testdata
 */

async function main(): Promise<void> {
  const db = connect();

  const { data: sumljivi, error } = await db
    .from("avtonet_oglasi")
    .select("id, avtonet_id, naziv, first_seen, status_spremenjen")
    .eq("status", "izginil");
  if (error) throw new Error(error.message);

  const rows = sumljivi ?? [];
  if (rows.length === 0) {
    console.log("Ni oglasov s statusom 'izginil' - nic za popraviti.");
    return;
  }

  // A listing that "disappeared" within minutes of first being seen did not
  // disappear; a truncated sweep simply never looked at it.
  const napacni = rows.filter((r) => {
    const seen = new Date(r.first_seen as string).getTime();
    const changed = new Date(r.status_spremenjen as string).getTime();
    return Number.isFinite(changed) && changed - seen < 60 * 60 * 1000;
  });

  console.log(`Oglasov s statusom 'izginil': ${rows.length}`);
  console.log(`Od tega sumljivih (izginil v manj kot uri): ${napacni.length}`);

  if (napacni.length === 0) {
    console.log("Nic za popraviti.");
    return;
  }

  const { error: updErr } = await db
    .from("avtonet_oglasi")
    .update({ status: "aktiven", status_spremenjen: null })
    .in("id", napacni.map((r) => r.id));
  if (updErr) throw new Error(updErr.message);

  console.log(`Popravljeno nazaj na 'aktiven': ${napacni.length}`);
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
