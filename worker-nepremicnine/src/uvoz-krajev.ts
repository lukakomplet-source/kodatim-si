import "dotenv/config";
import { readFileSync } from "node:fs";
import { connect } from "./db.js";
import { normKraj } from "../../src/lib/nepremicnine/kraji.js";

/**
 * Enkratni uvoz šifranta krajev iz GeoNames dnevnih izvozov (CC BY 4.0,
 * https://www.geonames.org). Zaganja se ročno:
 *
 *   npx tsx src/uvoz-krajev.ts pot/do/SI.txt pot/do/HR.txt
 *
 * Uvozi samo naseljena mesta (feature class P). Istoimenski kraji v isti
 * državi in upravni enoti se združijo v enega (največ prebivalcev) — pri
 * ujemanju prostega besedila tako zmaga največji kraj, kar je pravilno v
 * veliki večini oglasov in vedno označeno kot "približna" lokacija.
 */

type Vrstica = {
  ime: string;
  ime_norm: string;
  obcina: string;
  drzava: string;
  lat: number;
  lng: number;
  prebivalcev: number | null;
  vir: string;
};

function preberi(pot: string): Vrstica[] {
  const vrstice: Vrstica[] = [];
  for (const line of readFileSync(pot, "utf8").split("\n")) {
    const p = line.split("\t");
    if (p.length < 15 || p[6] !== "P") continue;
    const ime = p[1].trim();
    const lat = Number(p[4]);
    const lng = Number(p[5]);
    if (!ime || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const imeNorm = normKraj(ime);
    if (!imeNorm) continue;
    const prebivalcev = Number(p[14]);
    vrstice.push({
      ime,
      ime_norm: imeNorm,
      obcina: [p[10], p[11]].filter(Boolean).join("."),
      drzava: p[8] || "?",
      lat,
      lng,
      prebivalcev: Number.isFinite(prebivalcev) && prebivalcev > 0 ? prebivalcev : null,
      vir: "geonames",
    });
  }
  return vrstice;
}

async function main() {
  const poti = process.argv.slice(2);
  if (poti.length === 0) {
    console.error("Uporaba: tsx src/uvoz-krajev.ts <SI.txt> [HR.txt ...]");
    process.exit(2);
  }

  const vse = poti.flatMap(preberi);
  // Znotraj (ime_norm, obcina, drzava) obdrži največji kraj.
  const poKljucu = new Map<string, Vrstica>();
  for (const v of vse) {
    const kljuc = `${v.ime_norm}|${v.obcina}|${v.drzava}`;
    const obstojeca = poKljucu.get(kljuc);
    if (!obstojeca || (v.prebivalcev ?? 0) > (obstojeca.prebivalcev ?? 0)) poKljucu.set(kljuc, v);
  }
  const zaUvoz = [...poKljucu.values()];
  console.log(`Prebranih ${vse.length} naselij, za uvoz ${zaUvoz.length} unikatnih.`);

  const db = connect();
  let uvozenih = 0;
  for (let i = 0; i < zaUvoz.length; i += 500) {
    const paket = zaUvoz.slice(i, i + 500);
    const { error } = await db.from("nep_kraji").upsert(paket, { onConflict: "ime_norm,obcina,drzava" });
    if (error) throw new Error(`Paket ${i}: ${error.message}`);
    uvozenih += paket.length;
    if (i % 5000 === 0) console.log(`  ${uvozenih}/${zaUvoz.length}`);
  }
  const { count } = await db.from("nep_kraji").select("id", { count: "exact", head: true });
  console.log(`KONČANO: v šifrantu ${count} krajev.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
