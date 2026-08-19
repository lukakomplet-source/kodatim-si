import "dotenv/config";
import { connect } from "./db.js";
import { geokodirajOglase, naloziKraje, osveziPovzetke, preberiVse } from "./nepremicnine.js";

/**
 * Enkratni popravek geokodiranja: pred popravkom je pri istoimenskih krajih
 * zmagal VEČJI kraj ne glede na državo, zato so slovenske Bistrice in Loke
 * pristale na Hrvaškem. Zdaj zmaga najprej država (SI), potem velikost.
 *
 *   npx tsx src/popravi-geo.ts
 */

async function main() {
  const db = connect();
  const log = (m: string) => console.log(`[geo] ${m}`);

  const priblizni = await preberiVse<{ id: string }>(db, "nep_oglasi", "id", (q) =>
    q.eq("lokacija_natancnost", "priblizno")
  );
  log(`brišem koordinate ${priblizni.length} oglasov (bile so ugibane po napačnem vrstnem redu)`);
  for (let i = 0; i < priblizni.length; i += 200) {
    const paket = priblizni.slice(i, i + 200).map((o) => o.id);
    const { error } = await db
      .from("nep_oglasi")
      .update({ lat: null, lng: null, lokacija_natancnost: null })
      .in("id", paket);
    if (error) throw new Error(error.message);
  }

  const kraji = await naloziKraje(db);
  const st = await geokodirajOglase(db, kraji);
  log(`znova geokodiranih: ${st}`);
  await osveziPovzetke(db, log);
  log("KONČANO");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
