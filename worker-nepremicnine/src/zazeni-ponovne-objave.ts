import "dotenv/config";
import { connect } from "./db.js";
import { zaznajPonovneObjave } from "./ponovne-objave.js";

/**
 * Ročni zagon zaznave ponovnih objav (sicer teče v dnevnem knjigovodstvu).
 *   npm run ponovne:objave -- --suho          # samo prešteje
 *   npm run ponovne:objave -- --dni=60        # daljše okno za nazaj
 */
const suho = process.argv.includes("--suho");
const dni = Number(process.argv.find((a) => a.startsWith("--dni="))?.split("=")[1] ?? 45);
const izid = await zaznajPonovneObjave(connect(), (m) => console.log(m), { dni, suho });
console.log(JSON.stringify(izid));
await new Promise((r) => setTimeout(r, 300));
