import "dotenv/config";
import { connect } from "./db.js";

/**
 * How much space this actually costs, and what 30 more rounds would cost.
 *
 * The question "do we need a local database instead of Supabase" has a numeric
 * answer, and guessing it wrong is expensive in both directions: moving the
 * history onto one PC makes the web app depend on that PC being awake, while
 * leaving it in the cloud could quietly blow through the plan's storage.
 *
 * So this measures, from the real rows: how many adverts, how many snapshots,
 * how many bytes a snapshot actually occupies, and what the growth per research
 * round is. Nothing here is an estimate of an estimate — the byte counts come
 * from sampled rows.
 *
 *   npm run prostor
 */

const MB = 1024 * 1024;

function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Bytes a value occupies as UTF-8, which is how Postgres stores text. */
function bajti(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "string") return Buffer.byteLength(v, "utf8");
  if (typeof v === "number") return 8;
  if (typeof v === "boolean") return 1;
  return Buffer.byteLength(JSON.stringify(v), "utf8");
}

async function stej(db: ReturnType<typeof connect>, tabela: string): Promise<number> {
  const { count, error } = await db.from(tabela).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return count ?? 0;
}

async function main(): Promise<void> {
  const db = connect();

  const [oglasov, posnetkov] = await Promise.all([
    stej(db, "avtonet_oglasi"),
    stej(db, "avtonet_posnetki"),
  ]);

  // Sample rather than read everything: 500 rows is plenty to size an average,
  // and reading 1.5M snapshots to measure them would itself be the problem.
  const { data: vzorecPosnetki } = await db
    .from("avtonet_posnetki")
    .select("cena_eur, km, status, surovo, zajeto")
    .limit(500);
  const { data: vzorecOglasi } = await db.from("avtonet_oglasi").select("*").limit(300);

  const povprecje = (rows: Record<string, unknown>[] | null) => {
    if (!rows || rows.length === 0) return { skupaj: 0, poPolju: {} as Record<string, number> };
    const poPolju: Record<string, number> = {};
    let skupaj = 0;
    for (const r of rows) {
      for (const [k, v] of Object.entries(r)) {
        const b = bajti(v);
        poPolju[k] = (poPolju[k] ?? 0) + b;
        skupaj += b;
      }
    }
    for (const k of Object.keys(poPolju)) poPolju[k] = poPolju[k] / rows.length;
    return { skupaj: skupaj / rows.length, poPolju };
  };

  const p = povprecje(vzorecPosnetki as Record<string, unknown>[] | null);
  const o = povprecje(vzorecOglasi as Record<string, unknown>[] | null);

  // Postgres per-row overhead: 23-byte tuple header plus alignment and index
  // entries. 40 bytes per row is a deliberately conservative allowance so the
  // projection errs high rather than low.
  const REZIJA = 40;
  const bajtiPosnetek = p.skupaj + REZIJA;
  const bajtiOglas = o.skupaj + REZIJA;

  console.log("=".repeat(64));
  console.log("PROSTOR — IZMERJENO");
  console.log("=".repeat(64));
  console.log(`  Oglasov:                 ${oglasov.toLocaleString("sl-SI")}`);
  console.log(`  Posnetkov:               ${posnetkov.toLocaleString("sl-SI")}`);
  console.log("");
  console.log(`  Povprecen oglas:         ${bajtiOglas.toFixed(0)} B`);
  console.log(`  Povprecen posnetek:      ${bajtiPosnetek.toFixed(0)} B`);
  console.log("");
  console.log("  Najvecja polja posnetka (povprecno na vrstico):");
  for (const [k, v] of Object.entries(p.poPolju).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`    ${k.padEnd(14)} ${v.toFixed(0)} B`);
  }
  console.log("");
  console.log("  Najvecja polja oglasa (povprecno na vrstico):");
  for (const [k, v] of Object.entries(o.poPolju).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${k.padEnd(20)} ${v.toFixed(0)} B`);
  }

  const trenutno = oglasov * bajtiOglas + posnetkov * bajtiPosnetek;
  console.log("");
  console.log(`  SKUPAJ ZDAJ (ocena):     ${mb(trenutno)}`);

  console.log("");
  console.log("=".repeat(64));
  console.log("PROJEKCIJA — se 30 krogov");
  console.log("=".repeat(64));
  console.log("  Predpostavka: vsak krog zapise en posnetek na aktiven oglas.");
  console.log("");

  const naKrog = oglasov * bajtiPosnetek;
  console.log(`  Rast na krog:            ${mb(naKrog)}`);
  for (const krogov of [10, 30, 100]) {
    const skupaj = trenutno + naKrog * krogov;
    console.log(`  Po ${String(krogov).padStart(3)} krogih:          ${mb(skupaj)}`);
  }

  // What the same 30 rounds cost if a snapshot is written only when something
  // actually changed. The change rate is the honest unknown here, so both a
  // pessimistic and a realistic rate are shown rather than one invented number.
  console.log("");
  console.log("  Ce posnetek zapisemo SAMO ob spremembi (cena/km/status):");
  for (const delez of [0.05, 0.1, 0.2]) {
    const skupaj = trenutno + naKrog * 30 * delez;
    console.log(`    ${(delez * 100).toFixed(0).padStart(2)} % oglasov se spremeni -> po 30 krogih: ${mb(skupaj)}`);
  }

  console.log("");
  console.log("  Ce iz posnetka izpustimo se 'surovo':");
  const brezSurovo = p.skupaj - (p.poPolju.surovo ?? 0) + REZIJA;
  console.log(`    posnetek:              ${brezSurovo.toFixed(0)} B (namesto ${bajtiPosnetek.toFixed(0)} B)`);
  console.log(`    po 30 krogih (vsi):    ${mb(trenutno + oglasov * brezSurovo * 30)}`);
  console.log(`    po 30 krogih (10 %):   ${mb(trenutno + oglasov * brezSurovo * 30 * 0.1)}`);

  console.log("");
  console.log("  Za primerjavo: Supabase Free = 500 MB, Pro = 8 GB vkljuceno.");
}

main().catch((err) => {
  console.error("NAPAKA:", err instanceof Error ? err.message : err);
  process.exit(1);
});
