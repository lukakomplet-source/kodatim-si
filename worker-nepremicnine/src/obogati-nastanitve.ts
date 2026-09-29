import "dotenv/config";
import { connect } from "./db.js";
import { nastanitevIz } from "./parse.js";

/**
 * ENKRATNA OBOGATITEV: nastanitveni objekti v že zajetih oglasih.
 *
 * Zbiralnik od 28. 9. 2026 zazna hotel/penzion/apartmajsko hišo ob vsakem
 * zajemu, starih ~84.000 vrstic pa nihče ne bo znova prebral, dokler se oglas
 * ne spremeni. Ta skripta jih preleti enkrat, samo z besedilom, ki ga baza že
 * ima (naslov + opis) — noben zahtevek na vir.
 *
 * Piše SAMO, kar je zaznala, in nikoli ne zmanjša že zapisanega števila enot:
 * trditev "ima 3 stanovanja" iz adapterja ostane, če je penzion ne preseže.
 *
 *   npm run obogati:nastanitve            # zapiše
 *   npm run obogati:nastanitve -- --suho  # samo prešteje
 */

type Vrstica = {
  id: string;
  tip: string | null;
  naslov: string | null;
  opis: string | null;
  st_enot: number | string | null;
  st_enot_ocena: number | string | null;
  nastanitev: string | null;
  st_lezisc: number | string | null;
};

const SUHO = process.argv.includes("--suho");
const STRAN = 1000;

async function main(): Promise<void> {
  const db = connect();
  const poVrsti = new Map<string, number>();
  let pregledanih = 0;
  let spremenjenih = 0;
  let enot10 = 0;
  let enot12 = 0;
  const primeri: string[] = [];

  // ORDER BY je obvezen: brez njega PostgreSQL med stranmi vrne vrstice v
  // poljubnem redu in iste oglase vidimo dvakrat, druge nikoli (napaka, ki je
  // 17. 9. 2026 isto hišo trikrat postavila v feed).
  for (let od = 0; ; od += STRAN) {
    const { data, error } = await db
      .from("nep_oglasi")
      .select("id, tip, naslov, opis, st_enot, st_enot_ocena, nastanitev, st_lezisc")
      .order("id", { ascending: true })
      .range(od, od + STRAN - 1);
    if (error) throw new Error(`Branje ni uspelo pri ${od}: ${error.message}`);
    const vrstice = (data ?? []) as Vrstica[];
    if (vrstice.length === 0) break;

    for (const v of vrstice) {
      pregledanih += 1;
      const n = nastanitevIz(`${v.naslov ?? ""} ${v.opis ?? ""}`, v.tip);
      if (!n.vrsta) continue;
      poVrsti.set(n.vrsta, (poVrsti.get(n.vrsta) ?? 0) + 1);

      // PostgREST vrne števila lahko kot nize.
      const prejEnot = v.st_enot === null ? null : Number(v.st_enot);
      const posodobitev: Record<string, unknown> = {};
      if (v.nastanitev !== n.vrsta) posodobitev.nastanitev = n.vrsta;
      if (n.lezisc !== null && Number(v.st_lezisc) !== n.lezisc) posodobitev.st_lezisc = n.lezisc;
      if (n.enot !== null && (prejEnot === null || n.enot > prejEnot)) {
        posodobitev.st_enot = n.enot;
        if (n.enot >= 2) posodobitev.vec_enot = true;
      } else if (n.enot === null && n.enotOcena !== null && prejEnot === null && v.st_enot_ocena === null) {
        posodobitev.st_enot_ocena = n.enotOcena;
      }

      const koncno = Math.max(n.enot ?? 0, prejEnot ?? 0, n.enotOcena ?? 0);
      if (koncno >= 10) enot10 += 1;
      if (koncno >= 12) enot12 += 1;
      if (koncno >= 10 && primeri.length < 12) {
        primeri.push(`${n.vrsta.padEnd(18)} ${String(koncno).padStart(3)} enot  ${(v.naslov ?? "").slice(0, 70)}`);
      }

      if (Object.keys(posodobitev).length === 0) continue;
      spremenjenih += 1;
      if (SUHO) continue;
      const { error: e } = await db.from("nep_oglasi").update(posodobitev).eq("id", v.id);
      if (e) throw new Error(`Zapis ${v.id} ni uspel: ${e.message}`);
    }
    if (vrstice.length < STRAN) break;
  }

  console.log(`\nPregledanih ${pregledanih} oglasov${SUHO ? " (SUHO — nič zapisano)" : ""}.`);
  console.log(`Nastanitvenih objektov: ${[...poVrsti.values()].reduce((a, b) => a + b, 0)}`);
  for (const [vrsta, n] of [...poVrsti.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${vrsta.padEnd(20)} ${n}`);
  }
  console.log(`Z ≥10 enotami: ${enot10}   z ≥12: ${enot12}`);
  console.log(`${SUHO ? "Bi spremenil" : "Spremenjenih"}: ${spremenjenih} vrstic`);
  if (primeri.length > 0) console.log(`\nPrimeri ≥10 enot:\n  ${primeri.join("\n  ")}`);

  // Predah pred izhodom: odjemalec baze ima še odprte vtičnice in takojšen
  // konec procesa na Windowsu sproži trditev v libuv po že izpisanem izidu.
  await new Promise((r) => setTimeout(r, 300));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
