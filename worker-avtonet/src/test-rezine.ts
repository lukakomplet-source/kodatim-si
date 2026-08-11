import { korenskaRezina, opisiRezino, razdeli, type Rezina } from "./rezine.js";

/**
 * The slicing strategy, proved without a browser or a database.
 *
 * It simulates a market where some slices are over the cap and checks that
 * repeated splitting always terminates in slices the strategy considers final,
 * that a real brand list drives the first cut, and that the human labels read
 * the way the console will show them.
 *
 *   npm run test:rezine
 */

const napake: string[] = [];
function preveri(pogoj: boolean, opis: string): void {
  console.log(`  ${pogoj ? "OK  " : "NAPAKA"} ${opis}`);
  if (!pogoj) napake.push(opis);
}

const ZNAMKE = ["Audi", "BMW", "Volkswagen", "Škoda", "Renault"];

/**
 * A stand-in for the source: pretends a slice is over the cap unless it is
 * narrow enough. Brand-only and brand+price(wide) are "too big"; brand + a
 * single price band + a year band is "fine". Enough to force several levels.
 */
function prevelika(r: Rezina): boolean {
  const f = r.filtri;
  if (!f.znamka) return true;
  if (f.cenaMin === undefined) return true;
  const sirina = (f.cenaMax ?? 999999) - (f.cenaMin ?? 0);
  if (sirina > 5000 && f.letnikMin === undefined) return true;
  if (f.letnikMin === undefined) return false;
  return false;
}

function main(): void {
  console.log("1. Koren se razdeli po znamkah");
  const koren = korenskaRezina();
  const prvi = razdeli(koren, ZNAMKE);
  preveri(prvi !== null && prvi.length === ZNAMKE.length, `koren -> ${prvi?.length ?? 0} znamk`);
  preveri(prvi?.every((r) => r.filtri.znamka) ?? false, "vsaka je vezana na znamko");

  console.log("\n2. Rekurzija se vedno konča");
  const sklad: Rezina[] = [koren];
  const koncne: Rezina[] = [];
  let korakov = 0;
  while (sklad.length > 0) {
    if (++korakov > 100_000) break;
    const r = sklad.pop()!;
    if (prevelika(r)) {
      const otroci = razdeli(r, ZNAMKE);
      if (otroci) sklad.push(...otroci);
      else koncne.push(r); // unsplittable but still capped
    } else {
      koncne.push(r);
    }
  }
  preveri(korakov < 100_000, `rekurzija se ustavi (${korakov} korakov)`);
  preveri(koncne.length > ZNAMKE.length, `nastane veliko končnih rezin (${koncne.length})`);
  preveri(
    koncne.every((r) => !!r.filtri.znamka),
    "vse končne rezine imajo znamko"
  );

  console.log("\n3. Globina je omejena");
  preveri(koncne.every((r) => r.globina <= 6), "nobena rezina ne preseže največje globine");

  console.log("\n4. Berljive oznake");
  const primer = koncne.find((r) => r.filtri.cenaMin !== undefined);
  console.log(`     npr.: "${opisiRezino(primer!.filtri)}"`);
  preveri(!!primer && opisiRezino(primer.filtri).includes("€"), "oznaka cenovne rezine vsebuje €");

  console.log("\n" + "-".repeat(50));
  if (napake.length > 0) {
    console.log(`TEST NI USPEL — ${napake.length} napak.`);
    process.exitCode = 1;
  } else {
    console.log("TEST USPESEN.");
  }
}

main();
