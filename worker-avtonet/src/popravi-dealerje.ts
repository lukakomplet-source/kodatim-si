import "dotenv/config";
import { connect } from "./db.js";
import { oceniDealerja } from "./detail.js";

/**
 * Fills in `je_dealer` for adverts already processed, from the seller name that
 * was stored with them.
 *
 * No re-scraping: the evidence — a legal-form marker such as d.o.o. or s.p. in
 * the seller's name — is already in the database. Without this the column would
 * be empty for every advert collected before the parser learned to read it, and
 * the "only dealers" filter would stay blind on most of the market for months.
 *
 * Only sets true. A name without a marker is not proof of a private seller —
 * dealers trade under bare brand names too — so those stay null and the UI keeps
 * showing them as unknown.
 *
 *   npm run popravi:dealerje
 */

async function main(): Promise<void> {
  const db = connect();
  let pregledanih = 0;
  let oznacenih = 0;

  for (let od = 0; ; od += 1000) {
    const { data, error } = await db
      .from("avtonet_oglasi")
      .select("id, prodajalec_naziv, je_dealer")
      .not("detajl_zajet", "is", null)
      .is("je_dealer", null)
      .not("prodajalec_naziv", "is", null)
      .range(od, od + 999);
    if (error) throw new Error(error.message);

    const vrstice = (data ?? []) as { id: string; prodajalec_naziv: string | null }[];
    if (vrstice.length === 0) break;
    pregledanih += vrstice.length;

    const dealerji = vrstice.filter((v) => oceniDealerja(v.prodajalec_naziv, false) === true);
    if (dealerji.length > 0) {
      const { error: updErr } = await db
        .from("avtonet_oglasi")
        .update({ je_dealer: true })
        .in(
          "id",
          dealerji.map((d) => d.id)
        );
      if (updErr) throw new Error(updErr.message);
      oznacenih += dealerji.length;
    }

    console.log(`  pregledanih ${pregledanih}, oznacenih kot avtohisa ${oznacenih}`);
    if (vrstice.length < 1000) break;
  }

  const { count: skupaj } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .not("detajl_zajet", "is", null);
  const { count: dealerjev } = await db
    .from("avtonet_oglasi")
    .select("id", { count: "exact", head: true })
    .eq("je_dealer", true);

  console.log(`\nKoncano. Oglasov s podrobnostmi: ${skupaj}, prepoznanih avtohis: ${dealerjev}.`);
  console.log("Ostali ostajajo neznani - odsotnost pravne oblike ni dokaz, da je prodajalec fizicna oseba.");
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
