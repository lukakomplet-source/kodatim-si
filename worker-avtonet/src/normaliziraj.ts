import "dotenv/config";
import { connect, type Db } from "./db.js";
import { identiteta, prstniOdtis, primerljivostCene, type OglasZaIdentiteto } from "./identiteta.js";

/**
 * Polnjenje normalizirane identitete čez celo bazo.
 *
 * Teče lahko kadarkoli in kolikorkrat: za vsak oglas prebere podatke, ki jih
 * že imamo, in zapiše izračunana polja. Ne kliče avto.neta, torej ne more
 * povzročiti blokade in ne moti zbiralnika.
 *
 *   npm run normaliziraj           vsi oglasi brez izračuna
 *   npm run normaliziraj -- --vse  ponovni izračun čez vse (po spremembi pravil)
 *   npm run normaliziraj -- --test 200
 */

const POLJA =
  "id, avtonet_id, naziv, znamka, model, letnik, kw, gorivo, menjalnik, karoserija, pogon, " +
  "oprema, opis, oprema_znacilke, dodatni_podatki, cena_eur, cena_na_poziv, ddv_odbitek, status";

type Vrstica = OglasZaIdentiteto & {
  id: string;
  avtonet_id: string;
  cena_eur: number | string | null;
  cena_na_poziv: boolean | null;
  ddv_odbitek: boolean | null;
  status: string;
};

async function beri(db: Db, vse: boolean, od: number, koliko: number): Promise<Vrstica[]> {
  let q = db.from("avtonet_oglasi").select(POLJA).order("id").range(od, od + koliko - 1);
  if (!vse) q = q.is("identiteta_izracunana", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Vrstica[];
}

async function main(): Promise<void> {
  const vse = process.argv.includes("--vse");
  const testI = process.argv.indexOf("--test");
  const omejitev = testI >= 0 ? Number(process.argv[testI + 1] ?? 100) : Infinity;

  const db = connect();
  const zacetek = Date.now();
  let obdelanih = 0;
  const stevec = {
    zVin: 0,
    izvVisoka: 0,
    izvMotor: 0,
    izvMoc: 0,
    izvNi: 0,
    zaupanjeVsota: 0,
    neprimerljive: 0,
    razlogi: new Map<string, number>(),
    opremaVsota: 0,
  };

  // Ko se prepisuje vse, se `od` premika, ker filter ne izloča že obdelanih.
  let od = 0;
  for (;;) {
    const paket = await beri(db, vse, vse ? od : 0, 500);
    if (paket.length === 0) break;

    const posodobitve = paket.map((v) => {
      const i = identiteta(v);
      const c = primerljivostCene(v);
      stevec.zaupanjeVsota += i.zaupanje;
      stevec.opremaVsota += i.opremaTeza;
      if (i.vin) stevec.zVin++;
      if (i.izvedenkaVir === "naziv-znamka") stevec.izvVisoka++;
      else if (i.izvedenkaVir === "naziv-motor") stevec.izvMotor++;
      else if (i.izvedenkaVir === "moc") stevec.izvMoc++;
      else stevec.izvNi++;
      if (!c.primerljiva) {
        stevec.neprimerljive++;
        stevec.razlogi.set(c.razlog, (stevec.razlogi.get(c.razlog) ?? 0) + 1);
      }
      return {
        id: v.id,
        avtonet_id: v.avtonet_id,
        url: "",
        druzina_modela: i.druzinaModela,
        generacija: i.generacija,
        izvedenka: i.izvedenka,
        izvedenka_vir: i.izvedenkaVir,
        identiteta_zaupanje: i.zaupanje,
        pogon_norm: i.pogon,
        menjalnik_druzina: i.menjalnikDruzina,
        vin: i.vin,
        oprema_kljucna: i.oprema,
        oprema_teza: i.opremaTeza,
        prstni_odtis: prstniOdtis(i),
        cena_primerljiva: c.primerljiva,
        razlog_izkljucitve: c.razlog,
        identiteta_izracunana: new Date().toISOString(),
      };
    });

    // Posodobitev po vrsticah bi bila 500 klicev; upsert po ključu avtonet_id
    // je en klic. `url` je NOT NULL, zato ga upsert potrebuje — beremo ga nazaj
    // v paketu, da ga ne prepišemo s prazno vrednostjo.
    const { data: urlji } = await db
      .from("avtonet_oglasi")
      .select("id, url")
      .in("id", paket.map((p) => p.id));
    const poId = new Map(((urlji ?? []) as { id: string; url: string }[]).map((u) => [u.id, u.url]));
    for (const p of posodobitve) p.url = poId.get(p.id) ?? "";

    const { error } = await db.from("avtonet_oglasi").upsert(posodobitve, { onConflict: "id" });
    if (error) throw new Error(error.message);

    obdelanih += paket.length;
    od += paket.length;
    if (obdelanih % 5000 < 500) {
      console.log(`  ... ${obdelanih} obdelanih (${Math.round((Date.now() - zacetek) / 1000)} s)`);
    }
    if (obdelanih >= omejitev) break;
    if (paket.length < 500) break;
  }

  const p = (x: number) => `${((x / Math.max(1, obdelanih)) * 100).toFixed(1)} %`;
  console.log(`\nObdelanih: ${obdelanih} v ${Math.round((Date.now() - zacetek) / 1000)} s`);
  console.log(`  VIN:                     ${stevec.zVin} (${p(stevec.zVin)})`);
  console.log(`  izvedenka iz znamke:     ${stevec.izvVisoka} (${p(stevec.izvVisoka)})`);
  console.log(`  izvedenka iz motorja:    ${stevec.izvMotor} (${p(stevec.izvMotor)})`);
  console.log(`  izvedenka samo iz moci:  ${stevec.izvMoc} (${p(stevec.izvMoc)})`);
  console.log(`  brez izvedenke:          ${stevec.izvNi} (${p(stevec.izvNi)})`);
  console.log(`  povprecno zaupanje:      ${Math.round(stevec.zaupanjeVsota / Math.max(1, obdelanih))}/100`);
  console.log(`  povprecna teza opreme:   ${(stevec.opremaVsota / Math.max(1, obdelanih)).toFixed(1)}`);
  console.log(`  neprimerljivih cen:      ${stevec.neprimerljive} (${p(stevec.neprimerljive)})`);
  for (const [r, n] of [...stevec.razlogi].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${r}: ${n}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Napaka:", e instanceof Error ? e.message : e);
  process.exit(1);
});
