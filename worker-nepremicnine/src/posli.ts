import type { Db } from "./db.js";
import { preberiVse } from "./nepremicnine.js";

/**
 * Deal feed za nepremičnine — predizračunan v workerju po vsakem pregledu,
 * UI ga samo prebere iz nep_statistika (isti vzorec kot avtonet 'deal_feed':
 * ob renderju se ne računa nič, števke pa so za vse obiskovalce iste).
 *
 * Vsaka točka ima razlog, vsaka ocena vir: mediane €/m² prihajajo iz NAŠIH
 * aktivnih oglasov, ocena najemnine iz NAŠIH najemnih oglasov. Brez vzorca
 * ni številke.
 */

export type NepPosel = {
  id: string;
  url: string;
  naslov: string | null;
  kraj: string | null;
  regija: string | null;
  tip: string | null;
  cena: number;
  cenaM2: number | null;
  povrsina: number | null;
  zemljisce: number | null;
  stEnot: number | null;
  stEnotOcena: number | null;
  leto: number | null;
  dniNaTrgu: number;
  padecPct: number | null;
  medianaM2: number | null;
  medianaVzorec: number;
  odstopanjePct: number | null; // koliko pod mediano €/m² (pozitivno = ceneje)
  brutoDonosPct: number | null;
  najemNaM2: number | null;
  najemVzorec: number;
  agencija: string | null;
  telefon: string | null;
  vir: string;
  tocke: number;
  razlogi: string[];
};

type Vrstica = {
  id: string; vir: string; url: string; naslov: string | null; tip: string | null; regija: string | null;
  kraj: string | null; cena_eur: number | null; cena_prvotna_eur: number | null; cena_m2_eur: number | null;
  povrsina_m2: number | null; zemljisce_m2: number | null; st_enot: number | null; st_enot_ocena: number | null;
  leto_izgradnje: number | null; vec_enot: boolean; za_obnovo: boolean; za_investicijo: boolean;
  first_seen: string; data_quality: number | null; agencija: string | null; telefon: string | null;
};

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function izracunajPosle(db: Db, log: (msg: string) => void): Promise<number> {
  const polja =
    "id, vir, url, naslov, tip, regija, kraj, cena_eur, cena_prvotna_eur, cena_m2_eur, povrsina_m2, zemljisce_m2, st_enot, st_enot_ocena, leto_izgradnje, vec_enot, za_obnovo, za_investicijo, first_seen, data_quality, agencija, telefon";
  const prodajni = await preberiVse<Vrstica>(db, "nep_oglasi", polja, (q) =>
    q.eq("status", "aktiven").eq("posel", "prodaja").gte("cena_eur", 10_000)
  );
  const najemni = await preberiVse<{ regija: string | null; cena_eur: number | null; povrsina_m2: number | null }>(
    db, "nep_oglasi", "regija, cena_eur, povrsina_m2",
    (q) => q.eq("status", "aktiven").eq("posel", "oddaja").eq("tip", "stanovanje").gt("cena_eur", 100).lt("cena_eur", 10000)
  );

  // Mediane €/m² po (tip|regija) z rezervo na (tip) — iz lastnih oglasov.
  const skupine = new Map<string, number[]>();
  for (const o of prodajni) {
    if (o.cena_m2_eur === null) continue;
    const m2 = Number(o.cena_m2_eur);
    if (!Number.isFinite(m2) || m2 <= 0) continue;
    for (const k of [`${o.tip}|${o.regija}`, `${o.tip}|`]) {
      const arr = skupine.get(k) ?? [];
      arr.push(m2);
      skupine.set(k, arr);
    }
  }
  const medianeM2 = new Map<string, { m2: number; vzorec: number }>();
  for (const [k, arr] of skupine) if (arr.length >= 8) medianeM2.set(k, { m2: mediana(arr)!, vzorec: arr.length });

  const najemPoRegiji = new Map<string, number[]>();
  const najemVsi: number[] = [];
  for (const n of najemni) {
    if (n.cena_eur === null || n.povrsina_m2 === null || Number(n.povrsina_m2) <= 10) continue;
    const naM2 = Number(n.cena_eur) / Number(n.povrsina_m2);
    najemVsi.push(naM2);
    if (n.regija) {
      const arr = najemPoRegiji.get(n.regija) ?? [];
      arr.push(naM2);
      najemPoRegiji.set(n.regija, arr);
    }
  }
  const najemMediane = new Map<string, { naM2: number; vzorec: number }>();
  for (const [r, arr] of najemPoRegiji) if (arr.length >= 5) najemMediane.set(r, { naM2: mediana(arr)!, vzorec: arr.length });
  if (najemVsi.length >= 5) najemMediane.set("", { naM2: mediana(najemVsi)!, vzorec: najemVsi.length });

  const zdaj = Date.now();
  const posli: NepPosel[] = [];
  for (const o of prodajni) {
    const cena = Number(o.cena_eur);
    const cenaM2 = o.cena_m2_eur === null ? null : Number(o.cena_m2_eur);
    const povrsina = o.povrsina_m2 === null ? null : Number(o.povrsina_m2);
    let tocke = 0;
    const razlogi: string[] = [];

    const med = medianeM2.get(`${o.tip}|${o.regija}`) ?? medianeM2.get(`${o.tip}|`) ?? null;
    let odstopanjePct: number | null = null;
    if (med && cenaM2 !== null) {
      odstopanjePct = Math.round(((med.m2 - cenaM2) / med.m2) * 1000) / 10;
      if (odstopanjePct > 0) {
        const d = Math.round(Math.min(30, odstopanjePct * 0.75));
        tocke += d;
        razlogi.push(`${odstopanjePct} % pod mediano €/m² (n=${med.vzorec}) +${d}`);
      }
    }

    const najem = (o.regija ? najemMediane.get(o.regija) : null) ?? najemMediane.get("") ?? null;
    let brutoDonosPct: number | null = null;
    if (najem && povrsina !== null && povrsina > 10) {
      brutoDonosPct = Math.round(((najem.naM2 * povrsina * 12) / cena) * 1000) / 10;
      const d = brutoDonosPct >= 10 ? 20 : brutoDonosPct > 4 ? Math.round(((brutoDonosPct - 4) / 6) * 20) : 0;
      if (d > 0) {
        tocke += d;
        razlogi.push(`ocena bruto donosa ${brutoDonosPct} % (najemnina n=${najem.vzorec}) +${d}`);
      }
    }

    if (o.st_enot !== null && o.st_enot >= 2) {
      tocke += 15;
      razlogi.push(`${o.st_enot} enot potrjeno +15`);
    } else if (o.st_enot_ocena !== null && o.st_enot_ocena >= 2) {
      tocke += 10;
      razlogi.push(`~${o.st_enot_ocena} enot (ocena iz opisa) +10`);
    } else if (o.tip === "hisa" && povrsina !== null && povrsina >= 300) {
      tocke += 5;
      razlogi.push(`velika hiša ${povrsina} m² +5`);
    }

    let padecPct: number | null = null;
    if (o.cena_prvotna_eur !== null && Number(o.cena_prvotna_eur) > cena) {
      padecPct = Math.round(((Number(o.cena_prvotna_eur) - cena) / Number(o.cena_prvotna_eur)) * 1000) / 10;
      if (padecPct >= 3) {
        const d = Math.min(10, Math.round(padecPct));
        tocke += d;
        razlogi.push(`cena znižana ${padecPct} % +${d}`);
      }
    }

    const dniNaTrgu = Math.floor((zdaj - new Date(o.first_seen).getTime()) / 86_400_000);
    if (dniNaTrgu >= 90) {
      tocke += 5;
      razlogi.push(`${dniNaTrgu} dni na trgu +5`);
    }
    if (o.za_obnovo || o.za_investicijo) {
      tocke += 5;
      razlogi.push("označeno za obnovo/investicijo +5");
    }
    if (o.data_quality !== null && o.data_quality >= 75) {
      tocke += 5;
      razlogi.push("popolni podatki +5");
    }

    if (tocke < 40) continue;
    posli.push({
      id: o.id, url: o.url, naslov: o.naslov, kraj: o.kraj, regija: o.regija, tip: o.tip,
      cena, cenaM2, povrsina, zemljisce: o.zemljisce_m2 === null ? null : Number(o.zemljisce_m2),
      stEnot: o.st_enot, stEnotOcena: o.st_enot_ocena, leto: o.leto_izgradnje,
      dniNaTrgu, padecPct,
      medianaM2: med?.m2 ? Math.round(med.m2) : null, medianaVzorec: med?.vzorec ?? 0, odstopanjePct,
      brutoDonosPct, najemNaM2: najem ? Math.round(najem.naM2 * 100) / 100 : null, najemVzorec: najem?.vzorec ?? 0,
      agencija: o.agencija, telefon: o.telefon, vir: o.vir,
      tocke: Math.min(100, tocke), razlogi,
    });
  }

  posli.sort((a, b) => b.tocke - a.tocke || a.cena - b.cena);
  const najboljsi = posli.slice(0, 200);

  const { error } = await db.from("nep_statistika").upsert({
    kljuc: "posli",
    podatki: { posli: najboljsi, pregledanih: prodajni.length },
    izracunano: new Date().toISOString(),
  });
  if (error) log(`posli zapis: ${error.message}`);
  else log(`posli: ${najboljsi.length} od ${prodajni.length} pregledanih`);
  return najboljsi.length;
}
