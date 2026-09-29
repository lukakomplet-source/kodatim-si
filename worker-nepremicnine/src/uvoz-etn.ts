import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./db.js";
import { d96vWgs } from "./d96.js";
import { preberiCsv, preberiZip } from "./zip.js";
import { jeTrzen, kvantil, niProstiTrg, vrstaZaMediano } from "./etn.js";

/**
 * UVOZ GURS ETN — dejanske cene kupoprodajnih poslov.
 *
 * ZIP-e prenese ČLOVEK v javni aplikaciji JGP (glej
 * supabase/migration_nepremicnine_etn.sql, zakaj ne samodejno) in jih odloži v
 * mapo NEP_ETN_MAPA (privzeto D:\kodatim-podatki\gurs-etn). Imena so
 * ETN_SLO_<leto>_KPP_<datum izvoza>.zip; vsak vsebuje posli, delistavb,
 * zemljisca in sifranti (CSV, UTF-8, vejica, decimalna pika — opis strukture
 * ETN4 V15.1, GURS 2024).
 *
 *   npm run uvoz:etn             # uvozi nove ZIP-e in preračuna mediane
 *   npm run uvoz:etn -- --znova  # uvozi znova tudi že uvožene
 *
 * Kaj se NE shrani: ulica, hišna številka, številka stanovanja. Posamezen posel
 * z naslovom je ob povezavi s katastrom lahko osebni podatek; za primerjavo cen
 * zadostujejo naselje, katastrska občina in centroid parcele, na strani pa se
 * kažejo samo mediane.
 */

const MAPA = process.env.NEP_ETN_MAPA ?? "D:\\kodatim-podatki\\gurs-etn";
const ZNOVA = process.argv.includes("--znova");

type Sifrant = Map<string, string>; // "<id>|<vrednost>" -> opis

const st = (x: string | undefined): number | null => {
  if (x === undefined || x.trim() === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

function najdi(vnosi: { ime: string; podatki: Buffer }[], vzorec: RegExp): Record<string, string>[] {
  const v = vnosi.find((x) => vzorec.test(x.ime));
  if (!v) throw new Error(`V ZIP-u ni datoteke ${vzorec} — GURS je spremenil izvoz?`);
  return preberiCsv(v.podatki.toString("utf8"));
}

async function main(): Promise<void> {
  const db = connect();
  let datoteke: string[];
  try {
    datoteke = readdirSync(MAPA).filter((f) => /^ETN_SLO_\d{4}_KPP_\d{8}\.zip$/i.test(f)).sort();
  } catch {
    console.error(
      `Mape ${MAPA} ni. Prenesi ZIP-e v aplikaciji JGP (https://ipi.eprostor.gov.si/jgp/ → Trg in vrednosti ` +
        `nepremičnin → Kupoprodajni posli za območje Slovenije po letih) in jih odloži vanjo.`
    );
    process.exitCode = 2;
    return;
  }
  if (datoteke.length === 0) {
    console.error(`V ${MAPA} ni datotek ETN_SLO_<leto>_KPP_<datum>.zip.`);
    process.exitCode = 2;
    return;
  }

  const { data: ze } = await db.from("nep_etn_uvozi").select("datoteka");
  const uvozeni = new Set((ze ?? []).map((x) => x.datoteka as string));
  let stanje = "";

  for (const ime of datoteke) {
    stanje = ime.match(/_(\d{8})\.zip$/i)?.[1] ?? stanje;
    if (uvozeni.has(ime) && !ZNOVA) {
      console.log(`${ime}: že uvožen, preskočim.`);
      continue;
    }
    const vnosi = preberiZip(readFileSync(join(MAPA, ime)));
    const sifre: Sifrant = new Map();
    for (const s of najdi(vnosi, /sifranti/i)) sifre.set(`${s.ID}|${s.NUMERICNA_VREDNOST}`, s.OPIS);
    const opis = (id: number, v: string | undefined) => (v && v.trim() !== "" ? sifre.get(`${id}|${v.trim()}`) ?? null : null);

    const posli = new Map<string, Record<string, string>>();
    for (const p of najdi(vnosi, /posli/i)) posli.set(p.ID_POSLA, p);
    const deliPoPoslu = new Map<string, Record<string, string>[]>();
    for (const d of najdi(vnosi, /delistavb/i)) {
      const s = deliPoPoslu.get(d.ID_POSLA) ?? [];
      s.push(d);
      deliPoPoslu.set(d.ID_POSLA, s);
    }

    const vrstice: Record<string, unknown>[] = [];
    for (const [id, deli] of deliPoPoslu) {
      const p = posli.get(id);
      if (!p) continue;
      const cena = st(p.POGODBENA_CENA_ODSKODNINA);
      deli.forEach((d, i) => {
        const povrsina = st(d.UPORABNA_POVRSINA) ?? st(d.POVRSINA_DELA_STAVBE) ?? st(d.PRODANA_UPORABNA_POVRSINA_DELA_STAVBE);
        const e = st(d.E_CENTROID);
        const n = st(d.N_CENTROID);
        const geo = e && n ? d96vWgs(e, n) : null;
        // Cena na m² samo pri poslu z enim delom: pri dveh stanovanjih in
        // garaži v isti pogodbi cena enega dela ni razvidna.
        const naM2 = deli.length === 1 && cena && cena >= 5000 && povrsina && povrsina >= 10 ? Math.round((cena / povrsina) * 100) / 100 : null;
        vrstice.push({
          id_posla: Number(id),
          zaporedni: i + 1,
          leto: st(p.LETO) ?? st(ime.match(/_(\d{4})_KPP/i)?.[1]) ?? 0,
          datum_pogodbe: p.DATUM_SKLENITVE_POGODBE ? p.DATUM_SKLENITVE_POGODBE.slice(0, 10) : null,
          cena_posla_eur: cena,
          delov_v_poslu: deli.length,
          vrsta_posla: opis(24, p.VRSTA_KUPOPRODAJNEGA_POSLA),
          trznost: opis(88, p.TRZNOST_POSLA),
          vrsta_dela: opis(6, d.VRSTA_DELA_STAVBE),
          obcina: d.OBCINA || null,
          naselje: d.NASELJE || null,
          sifra_ko: st(d.SIFRA_KO),
          leto_izgradnje: st(d.LETO_IZGRADNJE_DELA_STAVBE),
          novogradnja: d.NOVOGRADNJA ? /^(1|da)$/i.test(opis(64, d.NOVOGRADNJA) ?? d.NOVOGRADNJA) : null,
          st_sob: st(d.STEVILO_SOB),
          povrsina_m2: povrsina,
          cena_m2_eur: naM2,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          izvoz: ime,
        });
      });
    }

    for (let i = 0; i < vrstice.length; i += 500) {
      const { error } = await db.from("nep_etn_posli").upsert(vrstice.slice(i, i + 500), { onConflict: "id_posla,zaporedni" });
      if (error) throw new Error(`${ime}: zapis ni uspel pri ${i}: ${error.message}`);
    }
    await db.from("nep_etn_uvozi").upsert({ datoteka: ime, vrstic: vrstice.length, uvozeno: new Date().toISOString() });
    console.log(`${ime}: ${posli.size} poslov, ${vrstice.length} delov stavb.`);
  }

  await izracunajMediane(db, stanje);
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * Mediane zadnjih DVEH let po naselju in občini. Dve leti zato, ker ima
 * večina naselij v enem letu premalo poslov; več kot dve pa bi v cene
 * vmešalo trg, ki ga ni več. Pogoji za vstop posla:
 *   - tržen (GURS oznaka), en del stavbe, 10+ m², cena vsaj 5.000 €;
 *   - cena/m² med 150 € in 20.000 € — zunaj tega so pogodbe za solastniške
 *     deleže, garaže v paketu in tipkarske napake;
 *   - vsaj 8 poslov na naselje oz. občino, sicer mediana ni podatek.
 */
async function izracunajMediane(db: ReturnType<typeof connect>, stanje: string): Promise<void> {
  const { data: maks } = await db.from("nep_etn_posli").select("leto").order("leto", { ascending: false }).limit(1);
  const doLeta = Number(maks?.[0]?.leto ?? 0);
  if (!doLeta) return;
  const odLeta = doLeta - 1;

  type V = { naselje: string | null; obcina: string | null; vrsta_dela: string | null; trznost: string | null; cena_m2_eur: number | string | null; vrsta_posla: string | null };
  const vse: V[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await db
      .from("nep_etn_posli")
      .select("naselje, obcina, vrsta_dela, trznost, cena_m2_eur, vrsta_posla")
      .gte("leto", odLeta)
      .not("cena_m2_eur", "is", null)
      .order("id_posla")
      .order("zaporedni")
      .range(od, od + 999);
    if (error) throw new Error(`Branje za mediane: ${error.message}`);
    vse.push(...((data ?? []) as V[]));
    if (!data || data.length < 1000) break;
  }

  const skupine = new Map<string, number[]>();
  const popust = new Map<string, number[]>(); // vrsta posla -> cene/m² (za primerjavo dražb s trgom)
  for (const v of vse) {
    const vrsta = vrstaZaMediano(v.vrsta_dela);
    const c = Number(v.cena_m2_eur);
    if (!vrsta || !Number.isFinite(c) || c < 150 || c > 20_000) continue;
    if (v.vrsta_posla) popust.set(`${vrsta}|${v.vrsta_posla}`, [...(popust.get(`${vrsta}|${v.vrsta_posla}`) ?? []), c]);
    if (!jeTrzen(v.trznost) || niProstiTrg(v.vrsta_posla)) continue;
    for (const [raven, ime] of [["naselje", v.naselje], ["obcina", v.obcina]] as const) {
      if (!ime) continue;
      const k = `${raven}|${ime.toLowerCase()}|${vrsta}`;
      const s = skupine.get(k) ?? [];
      s.push(c);
      skupine.set(k, s);
    }
  }

  const zapis: Record<string, unknown>[] = [];
  for (const [k, cene] of skupine) {
    if (cene.length < 8) continue;
    const [raven, ime, vrsta] = k.split("|");
    const u = [...cene].sort((a, b) => a - b);
    zapis.push({
      raven, ime, vrsta, od_leta: odLeta, do_leta: doLeta, n: u.length,
      mediana_m2: Math.round(kvantil(u, 0.5)), p25_m2: Math.round(kvantil(u, 0.25)), p75_m2: Math.round(kvantil(u, 0.75)),
      stanje: stanje ? `${stanje.slice(6, 8)}. ${stanje.slice(4, 6)}. ${stanje.slice(0, 4)}` : "", izracunano: new Date().toISOString(),
    });
  }
  await db.from("nep_etn_mediane").delete().neq("raven", "");
  for (let i = 0; i < zapis.length; i += 500) {
    const { error } = await db.from("nep_etn_mediane").insert(zapis.slice(i, i + 500));
    if (error) throw new Error(`Zapis median: ${error.message}`);
  }
  console.log(`Mediane ${odLeta}–${doLeta}: ${zapis.length} skupin (naselje/občina × stanovanje/hiša, vsaj 8 poslov).`);

  // Koliko ceneje gre na dražbi / v stečaju kot na prostem trgu — državno, po vrsti posla.
  const vrstice: string[] = [];
  for (const vrsta of ["stanovanje", "hisa"] as const) {
    const trg = [...popust.entries()].filter(([k]) => k.startsWith(`${vrsta}|`) && /prost|trg/i.test(k)).flatMap(([, c]) => c);
    if (trg.length < 30) continue;
    const mTrg = kvantil([...trg].sort((a, b) => a - b), 0.5);
    for (const [k, c] of popust) {
      if (!k.startsWith(`${vrsta}|`) || c.length < 10) continue;
      const m = kvantil([...c].sort((a, b) => a - b), 0.5);
      vrstice.push(`${vrsta.padEnd(10)} ${k.split("|")[1].slice(0, 50).padEnd(50)} n=${String(c.length).padStart(5)}  ${Math.round(m)} €/m²  (${Math.round((m / mTrg - 1) * 100)} % proti prostemu trgu)`);
    }
  }
  if (vrstice.length) console.log(`\nCena/m² po vrsti posla (${odLeta}–${doLeta}):\n  ${vrstice.join("\n  ")}`);
  await db.from("nep_statistika").upsert({ kljuc: "etn:po_vrsti_posla", podatki: { od: odLeta, do: doLeta, vrstice }, izracunano: new Date().toISOString() });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
