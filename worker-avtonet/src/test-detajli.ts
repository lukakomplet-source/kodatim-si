import "dotenv/config";
import { chromium } from "playwright";
import { connect } from "./db.js";
import { detailUrl, parseDetail } from "./detail.js";
import { fetchDetailPage } from "./collector.js";

/**
 * The detail parser against real adverts from several different brands.
 *
 * A parser verified on one advert is a parser verified for one advert: the
 * first version of the equipment split worked perfectly on the Audi it was
 * written against and would have mis-filed a seller's pitch on anything whose
 * prose was shorter. This picks adverts across distinct brands and reports how
 * often each field actually gets filled, so a field that only ever works for
 * German saloons is visible as a number rather than as a surprise months later.
 *
 *   npm run test:detajli            (10 adverts, one per brand)
 *   npm run test:detajli -- 20
 */

type Vrstica = { avtonet_id: string; znamka: string | null };

async function main(): Promise<void> {
  const koliko = Number(process.argv[2]) || 10;
  const db = connect();

  // One advert per brand, so the sample cannot be ten cars from one dealer.
  const { data, error } = await db
    .from("avtonet_oglasi")
    .select("avtonet_id, znamka")
    .eq("status", "aktiven")
    .not("znamka", "is", null)
    .limit(1500);
  if (error) throw new Error(error.message);

  const poZnamki = new Map<string, Vrstica>();
  for (const v of (data ?? []) as Vrstica[]) {
    const z = v.znamka ?? "?";
    if (!poZnamki.has(z)) poZnamki.set(z, v);
  }
  const vzorec = [...poZnamki.values()].slice(0, koliko);
  console.log(`Preverjam ${vzorec.length} oglasov: ${vzorec.map((v) => v.znamka).join(", ")}\n`);

  const polja = [
    "znamka", "model", "verzija", "karoserija", "barva", "notranjost", "pogon", "pogonski_sklop",
    "stevilo_vrat", "stevilo_sedezev", "lastnikov", "leto_proizvodnje", "emisijski_razred",
    "co2_g_km", "poraba_l_100km", "lokacija", "prodajalec_naziv", "je_dealer", "opis",
  ] as const;

  const polno: Record<string, number> = {};
  let zZnacilkami = 0;
  let zKategorijami = 0;
  let napak = 0;

  const browser = await chromium.launch({ headless: true });
  try {
    for (const v of vzorec) {
      try {
        const raw = await fetchDetailPage(browser, detailUrl(v.avtonet_id));
        const d = parseDetail(raw) as unknown as Record<string, unknown>;

        for (const p of polja) {
          const val = d[p];
          if (val !== null && val !== undefined && val !== "") polno[p] = (polno[p] ?? 0) + 1;
        }
        const znacilke = d.oprema_znacilke as string[];
        const kategorije = d.oprema_kategorije as Record<string, string[]>;
        if (znacilke.length > 0) zZnacilkami++;
        if (Object.keys(kategorije).length > 0) zKategorijami++;

        console.log(
          `  ${String(v.znamka).padEnd(14)} ${String(d.model ?? "—").padEnd(12)} ` +
            `znacilk=${String(znacilke.length).padStart(2)} kategorij=${Object.keys(kategorije).length} ` +
            `lastnikov=${d.lastnikov ?? "—"} vrat=${d.stevilo_vrat ?? "—"} dealer=${d.je_dealer ?? "—"}`
        );
        // Politeness between fetches; this runs alongside the real worker.
        await new Promise((r) => setTimeout(r, 2500));
      } catch (err) {
        napak++;
        console.log(`  ${String(v.znamka).padEnd(14)} NAPAKA: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await browser.close();
  }

  const n = vzorec.length - napak;
  console.log(`\nPOLNOST POLJ (${n} uspesnih oglasov):`);
  for (const p of polja) {
    const c = polno[p] ?? 0;
    const odstotek = n > 0 ? Math.round((c / n) * 100) : 0;
    console.log(`  ${p.padEnd(20)} ${String(c).padStart(3)}/${n}  ${String(odstotek).padStart(3)} %`);
  }
  console.log(`  ${"oprema_znacilke".padEnd(20)} ${String(zZnacilkami).padStart(3)}/${n}`);
  console.log(`  ${"oprema_kategorije".padEnd(20)} ${String(zKategorijami).padStart(3)}/${n}`);

  // The parser's job is the structure it can always get: brand and model on
  // every advert, and the equipment block on the ones that have one. Not every
  // advert does — a 1930s Rosengart genuinely lists no equipment — so that
  // threshold is 80 %, not 100 %, and the rest are reported without being
  // asserted, because colour and emissions are absent at the source.
  const kljucna =
    (polno.znamka ?? 0) === n && (polno.model ?? 0) === n && zKategorijami >= Math.ceil(n * 0.8);
  console.log("");
  console.log(kljucna ? "TEST USPESEN." : "TEST NI USPEL — kljucna polja niso zanesljiva.");
  if (!kljucna) process.exitCode = 1;
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
