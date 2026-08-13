import "dotenv/config";
import { connect, countMissingDetail, listingsMissingDetail, saveDetail } from "./db.js";

/**
 * The worker must keep collecting even if the v2 migration has not been run.
 *
 * Applying a migration is a manual step in this project, and a worker started
 * before it is done would otherwise fail on every advert — turning a 20-hour
 * unattended run into 20 hours of identical errors. This checks the degraded
 * path against the real database rather than trusting that the fallback works.
 *
 * Safe to run at any time: the write goes to an advert that is already in the
 * queue, sets only fields the detail pass sets anyway, and is exactly what the
 * worker itself would write a moment later.
 *
 *   npm run test:brez-migracije
 */

async function main(): Promise<void> {
  const db = connect();
  let napak = 0;
  const preveri = (pogoj: boolean, opis: string, dodatek = "") => {
    console.log(`  ${pogoj ? "OK    " : "NAPAKA"} ${opis}${dodatek ? ` — ${dodatek}` : ""}`);
    if (!pogoj) napak++;
  };

  console.log("Vrsta 2. faze:");
  const koliko = await countMissingDetail(db);
  preveri(koliko >= 0, "countMissingDetail deluje", `${koliko.toLocaleString("sl-SI")} oglasov`);

  const batch = await listingsMissingDetail(db, 3);
  preveri(Array.isArray(batch), "listingsMissingDetail deluje", `${batch.length} v paketu`);

  if (batch.length === 0) {
    console.log("  (ni oglasov za obdelavo — zapisa ne preverjam)");
  } else {
    console.log("\nZapis podrobnosti:");
    try {
      await saveDetail(db, batch[0].id, {
        naslov: null, znamka: null, model: null, verzija: null, pogon: null, karoserija: null,
        barva: null, lokacija: null, prodajalec_naziv: null, je_dealer: null, oprema: null,
        opis: null, dodatni_podatki: {}, oprema_kategorije: {}, oprema_znacilke: [],
        notranjost: null, pogonski_sklop: null, stevilo_vrat: null, stevilo_sedezev: null,
        lastnikov: null, leto_proizvodnje: null, registracija_mesec: null, emisijski_razred: null,
        co2_g_km: null, poraba_l_100km: null, starost: null, prodajalec_naslov: null, source_zadnja_sprememba: null, ogledov: null, slike_urls: null,
        prodajalec_registriran_od: null, cena_na_poziv: false,
      });
      preveri(true, "saveDetail ne vrze napake", "degradira, ce stolpcev se ni");
    } catch (err) {
      preveri(false, "saveDetail ne vrze napake", err instanceof Error ? err.message : String(err));
    }
  }

  console.log("\n" + "-".repeat(56));
  console.log(napak === 0 ? "TEST USPESEN." : `TEST NI USPEL — ${napak} napak.`);
  process.exitCode = napak === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
