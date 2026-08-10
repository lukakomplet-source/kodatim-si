import "dotenv/config";
import { connect } from "./db.js";

/**
 * What the collector actually spends its time on, measured from the event log
 * rather than estimated.
 *
 * The log records every page open and every advert, with timestamps, so the cost
 * per request is a measurement and not a guess — which matters here, because the
 * two phases turn out to differ by two orders of magnitude and an assumption
 * about the wrong one would send an optimisation in the wrong direction.
 *
 *   npx tsx src/meritve.ts
 */

async function main(): Promise<void> {
  const db = connect();

  const { data: raziskava } = await db
    .from("avtonet_raziskave")
    .select("id, zacetek, strani_pregledanih, oglasov_najdenih, detajlov_obdelanih, detajlov_skupaj")
    .order("zahtevano_ob", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!raziskava) {
    console.log("Ni raziskave.");
    return;
  }
  const r = raziskava as {
    id: string;
    zacetek: string | null;
    strani_pregledanih: number;
    oglasov_najdenih: number;
    detajlov_obdelanih: number;
    detajlov_skupaj: number;
  };

  const vzemi = async (vrsta: string, vzorec: string) => {
    const { data } = await db
      .from("avtonet_dogodki")
      .select("ob, sporocilo")
      .eq("raziskava_id", r.id)
      .eq("vrsta", vrsta)
      .like("sporocilo", vzorec)
      .order("id", { ascending: true })
      .limit(5000);
    return (data ?? []) as { ob: string; sporocilo: string }[];
  };

  const odpiranja = await vzemi("stran", "Odpiram stran%");
  const faze = await vzemi("faza", "%");
  const podrobnosti = await vzemi("oglas", "Podrobnosti %");

  console.log(`Raziskava ${r.id}`);
  console.log(`  strani: ${r.strani_pregledanih}  oglasov: ${r.oglasov_najdenih}`);
  console.log(`  podrobnosti: ${r.detajlov_obdelanih} / ${r.detajlov_skupaj}\n`);

  if (odpiranja.length >= 2) {
    const prva = new Date(odpiranja[0].ob).getTime();
    const zadnja = new Date(odpiranja[odpiranja.length - 1].ob).getTime();
    const sekund = (zadnja - prva) / 1000;
    const naStran = sekund / (odpiranja.length - 1);
    console.log("FAZA 1 - seznam");
    console.log(`  strani odprtih: ${odpiranja.length}`);
    console.log(`  skupaj: ${Math.round(sekund)} s (${(sekund / 60).toFixed(1)} min)`);
    console.log(`  na stran: ${naStran.toFixed(1)} s`);
    console.log(`  na oglas: ${((naStran / (r.oglasov_najdenih / odpiranja.length)) * 1000).toFixed(0)} ms`);
    console.log(`  -> 70.000 oglasov pri ~48/stran = ~${Math.round(70000 / 48)} strani = ${((70000 / 48) * naStran / 3600).toFixed(1)} h\n`);
  }

  if (podrobnosti.length >= 2) {
    const prva = new Date(podrobnosti[0].ob).getTime();
    const zadnja = new Date(podrobnosti[podrobnosti.length - 1].ob).getTime();
    const sekund = (zadnja - prva) / 1000;
    const naOglas = sekund / (podrobnosti.length - 1);
    console.log("FAZA 2 - podrobnosti");
    console.log(`  obdelanih: ${podrobnosti.length}`);
    console.log(`  skupaj: ${Math.round(sekund)} s (${(sekund / 60).toFixed(1)} min)`);
    console.log(`  na oglas: ${naOglas.toFixed(1)} s`);
    console.log(`  -> 70.000 oglasov = ${((70000 * naOglas) / 3600).toFixed(0)} h\n`);
  }

  const zacetekFaze2 = faze.find((f) => f.sporocilo.startsWith("2. faza"));
  if (r.zacetek && zacetekFaze2) {
    const faza1 = (new Date(zacetekFaze2.ob).getTime() - new Date(r.zacetek).getTime()) / 1000;
    console.log(`Faza 1 je trajala ${(faza1 / 60).toFixed(1)} min za ${r.oglasov_najdenih} oglasov.`);
  }
}

main().catch((err) => {
  console.error("NI USPELO:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
