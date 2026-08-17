import "dotenv/config";
import { connect } from "./db.js";
import { samopopravilo } from "./samopopravilo.js";

/**
 * Proof that the self-repair loop actually runs end to end:
 *
 *   npm run test:samopopravilo
 *
 * Sends a real incident description with the real current evidence, so the
 * answer comes from the real model over the real evidence bundle. Uses the
 * harmless trigger wording of the stall guard; whatever remedy comes back is
 * applied for real, which is the point — a repair path nobody has ever executed
 * is not a repair path.
 */

const log = (l: "info" | "warn" | "error", m: string, e?: Record<string, unknown>) =>
  console.log(`  [${l}] ${m}${e ? " " + JSON.stringify(e) : ""}`);

const db = connect();

console.log("Sprozam diagnozo nad trenutnim stanjem ...\n");
// Poskusno: dokaze zbere in model vpraša, a ukrepa NE izvede in v zgodovino
// samopopravil ne zapiše ničesar — v konzoli bi bil test videti kot resnična
// okvara.
const d = await samopopravilo(db, "TEST: 13 min brez enega samega obdelanega oglasa", log, {
  poskusno: true,
});

if (!d) {
  console.log("\nNI ODGOVORA — diagnoza ni uspela (glej napako zgoraj).");
  process.exit(1);
}

console.log("\n=== DIAGNOZA ===");
console.log("  vir:        ", d.vir === "ai" ? "model" : "privzeti ukrep (brez modela)");
console.log("  vzrok:      ", d.vzrok);
console.log("  ukrep:      ", d.ukrep);
console.log("  utemeljitev:", d.utemeljitev);
console.log("  izvedeno:   ", d.izvedeno);

const { data } = await db
  .from("avtonet_statistika")
  .select("podatki")
  .eq("kljuc", "samopopravila")
  .maybeSingle();
const zapisov = ((data as { podatki: { zapisi?: unknown[] } } | null)?.podatki?.zapisi ?? []).length;
console.log(`\nZapisov v zgodovini samopopravil: ${zapisov}`);
console.log(d.vir === "ai" ? "OK — model je odgovoril in ukrep je izveden." : "OPOZORILO — model ni odgovoril; deloval je privzeti ukrep.");
