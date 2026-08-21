import "dotenv/config";
import { connect } from "./db.js";
import { parseRowText } from "./parse.js";

/**
 * Popravek oglasov, pri katerih je bila shranjena IZVOZNA (neto) cena.
 *
 * Vir napiše "21.850 € oz. 17.909 € Export(*)". Parser je poznal samo obliko
 * "+ DDV", zato je pri teh oglasih shranil izvozno ceno kot ceno vozila — v
 * primerjavah so bili videti za petino prepoceni.
 *
 * Popravek NE ugiba: bruto cena je zapisana v posnetku, ki ga je zbiralnik že
 * shranil, zato se besedilo samo znova prebere s popravljenim parserjem.
 * Sprememba iz neto v bruto ni sprememba cene, zato se popravi tudi
 * cena_prvotna_eur, kadar je bila enaka napačni vrednosti — drugače bi vsak
 * tak avto izgledal, kot da mu je cena zrasla.
 *
 *   npm run popravi:izvozne          (samo pokaže, kaj bi spremenil)
 *   npm run popravi:izvozne -- --zares
 */

const zares = process.argv.includes("--zares");
const db = connect();

type Vrstica = {
  id: string;
  avtonet_id: string;
  cena_eur: number | string | null;
  cena_prvotna_eur: number | string | null;
  status: string;
};

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

// Oglasi, katerih zadnji posnetek omenja izvozno ceno.
const { data: posnetki, error } = await db
  .from("avtonet_posnetki")
  .select("oglas_id, surovo, zajeto")
  .ilike("surovo", "%export%")
  .order("zajeto", { ascending: false })
  .limit(5000);
if (error) throw new Error(error.message);

const najnovejsi = new Map<string, string>();
for (const p of (posnetki ?? []) as { oglas_id: string; surovo: string | null }[]) {
  if (p.surovo && !najnovejsi.has(p.oglas_id)) najnovejsi.set(p.oglas_id, p.surovo);
}
console.log(`Oglasov z izvozno ceno v posnetku: ${najnovejsi.size}`);

const idji = [...najnovejsi.keys()];
const oglasi: Vrstica[] = [];
for (let i = 0; i < idji.length; i += 300) {
  const { data } = await db
    .from("avtonet_oglasi")
    .select("id, avtonet_id, cena_eur, cena_prvotna_eur, status")
    .in("id", idji.slice(i, i + 300));
  oglasi.push(...((data ?? []) as Vrstica[]));
}

let popravljenih = 0;
let brezSpremembe = 0;
let neuspelih = 0;
const primeri: string[] = [];
const posodobitve: { id: string; cena_eur: number; cena_brez_ddv_eur: number | null; ddv_odbitek: boolean; cena_prvotna_eur: number }[] = [];

for (const o of oglasi) {
  const surovo = najnovejsi.get(o.id);
  if (!surovo) continue;
  const r = parseRowText(surovo, `details.asp?id=${o.avtonet_id}`);
  if (!r || r.cenaEur === null) {
    neuspelih++;
    continue;
  }
  const stara = num(o.cena_eur);
  if (stara === null || Math.abs(r.cenaEur - stara) < 1) {
    brezSpremembe++;
    continue;
  }
  const prvotna = num(o.cena_prvotna_eur);
  posodobitve.push({
    id: o.id,
    cena_eur: r.cenaEur,
    cena_brez_ddv_eur: r.cenaBrezDdvEur,
    ddv_odbitek: r.cenaBrezDdvEur !== null,
    // Popravek neto → bruto ni znižanje cene: če je bila prvotna enaka napačni,
    // se popravi z njo, sicer ostane, ker gre za resnično zgodovino.
    cena_prvotna_eur: prvotna !== null && Math.abs(prvotna - stara) < 1 ? r.cenaEur : (prvotna ?? r.cenaEur),
  });
  popravljenih++;
  if (primeri.length < 8) {
    primeri.push(`  ${o.avtonet_id}: ${stara.toLocaleString("sl-SI")} € → ${r.cenaEur.toLocaleString("sl-SI")} € (izvozna ${r.cenaBrezDdvEur?.toLocaleString("sl-SI") ?? "—"} €)`);
  }
}

console.log(`\nZa popravek: ${popravljenih}, že pravilnih: ${brezSpremembe}, neuspelo branje: ${neuspelih}`);
console.log(primeri.join("\n"));

if (!zares) {
  console.log("\nTo je bil suh tek. Za zapis dodaj --zares");
  process.exit(0);
}

for (let i = 0; i < posodobitve.length; i += 200) {
  const paket = posodobitve.slice(i, i + 200);
  for (const p of paket) {
    const { error: e } = await db
      .from("avtonet_oglasi")
      .update({
        cena_eur: p.cena_eur,
        cena_brez_ddv_eur: p.cena_brez_ddv_eur,
        ddv_odbitek: p.ddv_odbitek,
        cena_prvotna_eur: p.cena_prvotna_eur,
      })
      .eq("id", p.id);
    if (e) console.log(`  napaka pri ${p.id}: ${e.message}`);
  }
  console.log(`  ... ${Math.min(i + 200, posodobitve.length)} / ${posodobitve.length}`);
}
console.log(`\nPopravljenih ${posodobitve.length} oglasov.`);
process.exit(0);
