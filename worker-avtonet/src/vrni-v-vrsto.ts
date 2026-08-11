import "dotenv/config";
import { connect } from "./db.js";

/**
 * Puts a research that is stuck in `tece` back into the queue.
 *
 * Needed after stopping the worker to pick up new code: the row stays `tece`
 * because that is what lets the next worker resume it, but a stopped worker
 * leaves nobody to claim it until either the stale timeout elapses or this runs.
 *
 *   npm run vrni
 */
async function main(): Promise<void> {
  const db = connect();
  const { data, error } = await db
    .from("avtonet_raziskave")
    .update({ status: "zahtevano" })
    .eq("status", "tece")
    .select("id");
  if (error) throw new Error(error.message);

  const vrstice = (data ?? []) as { id: string }[];
  console.log(
    vrstice.length === 0
      ? "Nobene raziskave ni bilo treba vrniti."
      : `Vrnjeno v vrsto: ${vrstice.map((v) => v.id).join(", ")}`
  );
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
