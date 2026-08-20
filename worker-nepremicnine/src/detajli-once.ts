import "dotenv/config";
import { connect } from "./db.js";
import { najdiVir } from "./viri/index.js";
import { zajemiDetajle } from "./detajli.js";

/**
 * En krog 2. faze iz ukazne vrstice, z ročno kvoto. Namenjeno preizkusu in
 * dohitevanju iz seje, ne da bi bilo treba ponovno zagnati demona.
 *
 *   npx tsx src/detajli-once.ts nepremicnine.net 5
 */

const virIme = process.argv[2] ?? "nepremicnine.net";
const kvota = Number(process.argv[3] ?? 5);
const vir = najdiVir(virIme);
if (!vir.detajli) {
  console.error(`Vir ${vir.vir} nima detajlnega bralnika.`);
  process.exit(2);
}

const db = connect();
const log = (lvl: string, msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ lvl, msg, ...extra }));

const izid = await zajemiDetajle(
  db,
  { ...vir, detajli: { ...vir.detajli, kvota } },
  log,
  async (p) => console.log("  napredek:", JSON.stringify(p)),
  () => {},
  () => false
);
console.log("IZID:", JSON.stringify(izid));
process.exit(izid.obdelanih > 0 || izid.ostalo === 0 ? 0 : 1);
