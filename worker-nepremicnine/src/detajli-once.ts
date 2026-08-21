import "dotenv/config";
import { connect } from "./db.js";
import { najdiVir } from "./viri/index.js";
import { zajemiDetajle } from "./detajli.js";
import { hlajenjeDo } from "./samopopravilo.js";

/**
 * En krog 2. faze iz ukazne vrstice, z ročno kvoto. Namenjeno preizkusu in
 * dohitevanju iz seje, ne da bi bilo treba ponovno zagnati demona.
 *
 *   npx tsx src/detajli-once.ts nepremicnine.net 5
 */

const virIme = process.argv[2] ?? "nepremicnine.net";
const kvota = Number(process.argv[3] ?? 5);
const vir = najdiVir(virIme);
if (!vir) {
  console.error(`Vira "${virIme}" ni v registru adapterjev.`);
  process.exit(2);
}
const detajli = vir.detajli;
if (!detajli) {
  console.error(`Vir ${vir.vir} nima detajlnega bralnika.`);
  process.exit(2);
}

const db = connect();
const log = (lvl: string, msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ lvl, msg, ...extra }));

// Hlajenje velja tudi tu. Ročno orodje, ki blokado obide, je blokado obšlo —
// ne glede na to, kdo ga je pognal in zakaj.
const hlajenje = await hlajenjeDo(db, vir.vir);
if (hlajenje) {
  console.error(
    `Vir ${vir.vir} počiva po blokadi do ${new Date(hlajenje).toLocaleString("sl-SI")}. Blokade ne obidemo.`
  );
  process.exit(4);
}

const izid = await zajemiDetajle(
  db,
  { ...vir, detajli: { ...detajli, kvota } },
  log,
  async (p) => console.log("  napredek:", JSON.stringify(p)),
  () => {},
  () => false
);
console.log("IZID:", JSON.stringify(izid));
process.exit(izid.obdelanih > 0 || izid.ostalo === 0 ? 0 : 1);
