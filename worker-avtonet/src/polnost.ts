import "dotenv/config";
import { connect } from "./db.js";

/**
 * How complete the captured detail data actually is.
 *
 * The question this answers is not "did phase 2 run" but "will there be enough
 * to analyse later". A field present on 2% of adverts cannot carry a comparison;
 * one present on 95% can. Measured over a real sample of already-processed rows
 * rather than assumed from the parser's intentions.
 *
 *   npm run polnost
 */

const POLJA = [
  "verzija",
  "karoserija",
  "pogon",
  "barva",
  "lokacija",
  "prodajalec_naziv",
  "je_dealer",
  "oprema",
  "opis",
] as const;

async function main(): Promise<void> {
  const db = connect();

  const { count: zDetajli } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .not("detajl_zajet", "is", null);

  const { data } = await db
    .from("avtonet_oglasi")
    .select(`${POLJA.join(", ")}, dodatni_podatki`)
    .not("detajl_zajet", "is", null)
    .limit(1000);

  const vrstice = (data ?? []) as unknown as Record<string, unknown>[];
  if (vrstice.length === 0) {
    console.log("Se ni nobenega oglasa z zajetimi podrobnostmi.");
    return;
  }

  console.log(`Obdelanih skupaj: ${zDetajli}. Vzorec za merjenje: ${vrstice.length}\n`);
  console.log("POLNOST POLJ (delez oglasov, ki podatek imajo)");

  for (const p of POLJA) {
    const n = vrstice.filter((v) => v[p] !== null && v[p] !== undefined && v[p] !== "").length;
    const odstotek = Math.round((n / vrstice.length) * 100);
    const crta = "#".repeat(Math.round(odstotek / 4)).padEnd(25, ".");
    console.log(`  ${p.padEnd(18)} ${crta} ${String(odstotek).padStart(3)} %`);
  }

  // The jsonb bag is the safety net: anything the site publishes that we have no
  // column for still lands there, so a later analysis is not limited to the
  // fields somebody thought of today.
  const pari = vrstice.map((v) => Object.keys((v.dodatni_podatki ?? {}) as object).length);
  const povp = Math.round(pari.reduce((a, b) => a + b, 0) / pari.length);
  console.log(`\n  dodatni_podatki    povprecno ${povp} parov na oglas (min ${Math.min(...pari)}, max ${Math.max(...pari)})`);

  // Which labels appear most often — the vocabulary available for grouping later.
  const stevec = new Map<string, number>();
  for (const v of vrstice) {
    for (const k of Object.keys((v.dodatni_podatki ?? {}) as object)) {
      stevec.set(k, (stevec.get(k) ?? 0) + 1);
    }
  }
  console.log("\nNAJPOGOSTEJSE OZNAKE V dodatni_podatki");
  for (const [k, n] of [...stevec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
    console.log(`  ${String(Math.round((n / vrstice.length) * 100)).padStart(3)} %  ${k}`);
  }

  const zOpremo = vrstice.find((v) => typeof v.oprema === "string" && (v.oprema as string).length > 40);
  if (zOpremo) {
    console.log("\nPRIMER OPREME");
    console.log(`  ${(zOpremo.oprema as string).slice(0, 300)}...`);
  }
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
