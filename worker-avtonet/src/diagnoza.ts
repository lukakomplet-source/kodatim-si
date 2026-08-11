import "dotenv/config";
import { connect } from "./db.js";

/**
 * Why some detail columns are thin while the raw pairs behind them are not.
 *
 * `dodatni_podatki` keeps every label/value pair the page published, so a column
 * that is empty while its pair is present is a parser fault, not missing source
 * data — and it can be repaired from what is already stored, without re-scraping.
 */
async function main(): Promise<void> {
  const db = connect();
  const { data } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id, lokacija, pogon, prodajalec_naziv, je_dealer, oprema, dodatni_podatki")
    .not("detajl_zajet", "is", null)
    .limit(500);

  const vrstice = (data ?? []) as unknown as {
    lokacija: string | null;
    pogon: string | null;
    prodajalec_naziv: string | null;
    oprema: string | null;
    dodatni_podatki: Record<string, string> | null;
  }[];

  const jsonKljuc = (r: (typeof vrstice)[number], k: string) => r.dodatni_podatki?.[k] ?? null;

  const brezLok = vrstice.filter((r) => !r.lokacija && jsonKljuc(r, "Kraj ogleda"));
  console.log(`Vrstic: ${vrstice.length}`);
  console.log(`Brez lokacije, a "Kraj ogleda" JE v jsonb: ${brezLok.length}`);
  for (const r of brezLok.slice(0, 6)) {
    console.log(`   Kraj ogleda = ${JSON.stringify(jsonKljuc(r, "Kraj ogleda"))}`);
  }

  console.log("\nPrimeri, kjer je lokacija zajeta:");
  for (const r of vrstice.filter((r) => r.lokacija).slice(0, 4)) {
    console.log(`   ${JSON.stringify(r.lokacija)}`);
  }

  const pogonVOpremi = vrstice.filter((r) => !r.pogon && /pogon|4x4|4WD/i.test(r.oprema ?? ""));
  console.log(`\nBrez pogona, a omenjen v opremi: ${pogonVOpremi.length}`);
  for (const r of pogonVOpremi.slice(0, 4)) {
    const m = (r.oprema ?? "").match(/[^;]*(pogon|4x4|4WD)[^;]*/i);
    console.log(`   ${JSON.stringify(m?.[0]?.trim().slice(0, 70))}`);
  }

  console.log("\nPrimeri prodajalcev:");
  for (const r of vrstice.slice(0, 12)) console.log(`   ${JSON.stringify(r.prodajalec_naziv)}`);
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
