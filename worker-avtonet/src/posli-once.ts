import "dotenv/config";
import { connect } from "./db.js";
import { izracunajPosle } from "./dealfeed2.js";

/**
 * Ročni zagon izračuna poslov 2.0 — brez celotnega pregleda trga.
 *
 *   npm run posli
 */
const db = connect();
const log = (level: string, msg: string, extra?: Record<string, unknown>) => {
  console.log(`[${level}] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);
};

await izracunajPosle(db, log as Parameters<typeof izracunajPosle>[1]);
console.log("Končano.");
process.exit(0);
