import "dotenv/config";
import { connect } from "./db.js";

/**
 * Kakšne tipe res vrne PostgREST? Od tega je odvisno, ali "cena + prenova" v
 * kalkulatorju sešteje ali zlepi niza. MCP orodje (node-postgres) numeric vrača
 * kot NIZ, PostgREST pa ne — ta test pove, kaj velja za pot, ki jo uporablja
 * aplikacija.
 */
async function main() {
  const db = connect();
  const { data } = await db
    .from("nep_oglasi")
    .select("cena_eur, povrsina_m2, padec_pct, lat, st_enot, vec_enot, first_seen")
    .not("cena_eur", "is", null)
    .not("povrsina_m2", "is", null)
    .not("lat", "is", null)
    .limit(1);
  const v = (data ?? [])[0] as Record<string, unknown>;
  for (const [k, x] of Object.entries(v ?? {})) console.log(`  ${k}: ${typeof x} = ${JSON.stringify(x)}`);

  const cena = v?.cena_eur as number;
  const vsota = cena + 0 + 3870;
  console.log(`\n  cena + 0 + 3870 = ${JSON.stringify(vsota)} (${typeof vsota})`);
  const ok = typeof vsota === "number" && Number.isFinite(vsota);
  console.log(ok ? "\nVSE OK (aritmetika deluje)" : "\nNAPAKA: numeric pride kot niz -> seštevanje zlepi nize");
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
