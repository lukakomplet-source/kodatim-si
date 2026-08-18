import type { Db } from "./db.js";

/**
 * Statistika 2.0 — every aggregate the pages show, computed ONCE per research.
 *
 * Pages used to compute statistics per request from raw rows; at 50k+ adverts
 * and with heavier work (dealer rankings, deal scoring) that would make every
 * click pay for the same computation. The data only changes when a sweep runs,
 * so this runs after each research and writes results into avtonet_statistika;
 * pages just read JSON.
 *
 * Honesty rules carried over from the rest of the system: every figure carries
 * its sample; below-threshold aggregates are omitted, not shown thin; relisted
 * adverts (naslednji_oglas_id) never count as sales; last seen price is never
 * called a sale price.
 */

type Log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;

type Oglas = {
  id: string;
  avtonet_id: string;
  url: string;
  naziv: string | null;
  znamka: string | null;
  model: string | null;
  letnik: number | null;
  km: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  karoserija: string | null;
  barva: string | null;
  cena_eur: number | string | null;
  cena_prvotna_eur: number | string | null;
  status: string;
  first_seen: string;
  status_spremenjen: string | null;
  source_zadnja_sprememba: string | null;
  naslednji_oglas_id: string | null;
  je_dealer: boolean | null;
  prodajalec_naziv: string | null;
  lokacija: string | null;
  ogledov: number | null;
  starost: string | null;
  /** Engine power in kW — the single best proxy for "same engine". */
  kw: number | null;
  /** True when the source also prints a net ("+ DDV") price for this car. */
  ddv_odbitek: boolean | null;
  cena_brez_ddv_eur: number | string | null;
  /** Normalised equipment tags ("klima", "acc", "alu_platisca" …). */
  oprema_znacilke: string[] | null;
};

const POLJA =
  "id, avtonet_id, url, naziv, znamka, model, letnik, km, gorivo, menjalnik, karoserija, barva, " +
  "cena_eur, cena_prvotna_eur, status, first_seen, status_spremenjen, source_zadnja_sprememba, " +
  "naslednji_oglas_id, je_dealer, prodajalec_naziv, lokacija, ogledov, starost, kw, oprema_znacilke, " +
  "ddv_odbitek, cena_brez_ddv_eur";

/**
 * The engine, as the market names it.
 *
 * "C-Razred" is not a price class: a C 180 (115 kW) and a C 43 AMG (287 kW) are
 * the same "model" and nothing like the same car, and comparing one against the
 * other is what produced a median of 44.360 EUR for a 27.000 EUR C 180. The badge
 * in the title IS the class — 180, 220 d, 320d, xDrive30d, 2.0 TDI — so it
 * belongs in the cohort key.
 *
 * Read from the advert's own title, in the order the market writes it, with the
 * engine's power as the fallback: a car whose badge we cannot parse still groups
 * with cars of the same output rather than with everything wearing the same
 * model name.
 */
function motorKljuc(o: Oglas): string {
  const naziv = (o.naziv ?? "").toLowerCase();

  // BMW/Mercedes style: 320d, 530i, 220 d, 300 de, xDrive30d, 45 AMG.
  const nemski = naziv.match(/\b(?:xdrive|sdrive|quattro|4matic)?\s*(\d{2,3})\s*(d|i|e|de|td)?\b/);
  // Displacement + fuel family: 2.0 TDI, 1.5 TSI, 1.6 dCi, 2.2 CRDi.
  const prostornina = naziv.match(/\b(\d[.,]\d)\s*(tdi|tsi|tfsi|fsi|crdi|dci|hdi|jtd|cdti|bluehdi|thp|multijet|d4d|vti|gdi)\b/);

  if (prostornina) return `${prostornina[1].replace(",", ".")}${prostornina[2]}`;
  // Three digits between 100 and 999 that are not a year and not a trim number.
  if (nemski && Number(nemski[1]) >= 100 && Number(nemski[1]) <= 999) {
    return `${nemski[1]}${nemski[2] ?? ""}`;
  }
  // Power, in 15 kW buckets: coarse enough to group, fine enough to separate a
  // 115 kW C 180 from a 245 kW C 400.
  if (o.kw) return `${Math.round(o.kw / 15) * 15}kw`;
  return "?";
}

/**
 * Gearbox as two buckets, because that is how the market prices it.
 *
 * The source writes "avtomatski", "avtomatski - DSG", "ročni 6 prestav" and a
 * dozen variants; comparing an automatic against a manual of the same model is
 * comparing two different cars, and a name-by-name match would put each variant
 * in a cohort of its own.
 */
function menjalnikKljuc(v: string | null): string {
  const t = (v ?? "").toLowerCase();
  if (!t) return "?";
  return /avtomat|dsg|s.tronic|tiptronic|cvt|edc|dct/.test(t) ? "avtomatski" : "rocni";
}

/** Body style, normalised — "kombilimuzina / hatchback" and "hatchback" are one. */
function karoserijaKljuc(v: string | null): string {
  const t = (v ?? "").toLowerCase().trim();
  if (!t) return "?";
  if (/karavan|estate|touring|variant|\bsw\b/.test(t)) return "karavan";
  if (/terensko|suv|crossover/.test(t)) return "suv";
  if (/limuzina|sedan/.test(t) && !/kombilimuzina/.test(t)) return "limuzina";
  if (/kombilimuzina|hatchback/.test(t)) return "hatchback";
  if (/enoprostorec|van|monovolumen/.test(t)) return "van";
  if (/kupe|coupe|cabrio|roadster|kabriolet/.test(t)) return "kupe";
  if (/pickup|pick.up|dostavni|tovorno/.test(t)) return "dostavno";
  return t.split(/[\/,]/)[0].trim();
}

/**
 * How alike two cars' equipment is, 0–1 (Jaccard over the normalised tags).
 *
 * Equipment is the difference between a base model and a loaded one at the same
 * price, so a cohort that ignores it produces "deals" that are simply poorer
 * cars. When either side has no tags captured we return 1 rather than 0: an
 * unknown must not be treated as a mismatch, or every advert whose detail page
 * has not been read yet would silently drop out of every comparison.
 */
function opremaUjemanje(a: Oglas, b: Oglas): number {
  const x = a.oprema_znacilke ?? [];
  const y = b.oprema_znacilke ?? [];
  if (x.length === 0 || y.length === 0) return 1;
  const setA = new Set(x);
  const setB = new Set(y);
  let skupnih = 0;
  for (const t of setA) if (setB.has(t)) skupnih += 1;
  const unija = setA.size + setB.size - skupnih;
  return unija === 0 ? 1 : skupnih / unija;
}

/** Brand-new stock behaves like a price list, not a market — excluded from comparisons. */
function jeNov(o: Oglas): boolean {
  return /nov/i.test(o.starost ?? "") || (o.km !== null && o.km < 500);
}

const DAN = 86_400_000;

function num(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function modelKljuc(o: { znamka: string | null; model: string | null }): string {
  return [o.znamka, o.model].filter(Boolean).join(" ").trim();
}

/** A relist is not a sale — the single gate for every sale statistic here. */
function veljavnaProdaja(o: Oglas): boolean {
  return !o.naslednji_oglas_id;
}

/** Days on board; start is the EARLIER of our first sighting and the source's own date. */
function dniNaTrgu(o: Oglas): number | null {
  if (!o.status_spremenjen) return null;
  let zacetek = new Date(o.first_seen).getTime();
  if (o.source_zadnja_sprememba) {
    const vir = new Date(o.source_zadnja_sprememba).getTime();
    if (Number.isFinite(vir) && vir < zacetek) zacetek = vir;
  }
  const d = (new Date(o.status_spremenjen).getTime() - zacetek) / DAN;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/** Dealer name collapsed so "AVTO X d.o.o." and "Avto X D.O.O." are one dealer. */
function kljucTrgovca(naziv: string | null): string | null {
  if (!naziv) return null;
  const k = naziv
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(D\s*O\s*O|S\s*P|K\s*D|D\s*D)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return k.length >= 3 ? k : null;
}

/** Slovenian region from the postal code hiding in `lokacija`. */
function regija(lokacija: string | null): string | null {
  const m = (lokacija ?? "").match(/\b([1-9])\d{3}\b/);
  if (!m) return null;
  const R: Record<string, string> = {
    "1": "Osrednja Slovenija", "2": "Štajerska/Koroška", "3": "Savinjska", "4": "Gorenjska",
    "5": "Goriška", "6": "Primorska/Kras", "8": "Dolenjska/Posavje", "9": "Pomurska",
  };
  return R[m[1]] ?? null;
}

/** Views per day since the ad's own (or our) first date. */
function oglediNaDan(o: Oglas): number | null {
  if (o.ogledov === null || o.ogledov === undefined) return null;
  const zacetek = o.source_zadnja_sprememba
    ? Math.min(new Date(o.source_zadnja_sprememba).getTime(), new Date(o.first_seen).getTime())
    : new Date(o.first_seen).getTime();
  const dni = Math.max(1, (Date.now() - zacetek) / DAN);
  return Math.round((o.ogledov / dni) * 10) / 10;
}

/** All rows, paged past PostgREST's 1000-row ceiling. */
async function preberiVse(db: Db, filter: (q: unknown) => unknown): Promise<Oglas[]> {
  const out: Oglas[] = [];
  for (let od = 0; ; od += 1000) {
    let q = db.from("avtonet_oglasi").select(POLJA) as unknown;
    q = filter(q);
    const { data, error } = await (q as { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }).range(od, od + 999);
    if (error) throw new Error(`Branje oglasov ni uspelo: ${error.message}`);
    const rows = (data ?? []) as Oglas[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function zapisi(db: Db, kljuc: string, podatki: unknown): Promise<void> {
  const { error } = await db
    .from("avtonet_statistika")
    .upsert({ kljuc, podatki, izracunano: new Date().toISOString() });
  if (error) throw new Error(`Zapis statistike '${kljuc}' ni uspel: ${error.message}`);
}

async function preberiKljuc<T>(db: Db, kljuc: string): Promise<T | null> {
  const { data } = await db.from("avtonet_statistika").select("podatki").eq("kljuc", kljuc).maybeSingle();
  return (data as { podatki: T } | null)?.podatki ?? null;
}

// ---------------------------------------------------------------------------

export async function izracunajStatistiko(db: Db, log: Log): Promise<void> {
  const zacetek = Date.now();

  // One read each; everything below is in-memory arithmetic.
  const aktivni = await preberiVse(db, (q) =>
    (q as { eq: (c: string, v: string) => unknown }).eq("status", "aktiven")
  );
  const od180 = new Date(Date.now() - 180 * DAN).toISOString();
  const zakljuceni = (await preberiVse(db, (q) =>
    (q as { in: (c: string, v: string[]) => { gte: (c: string, v: string) => unknown } })
      .in("status", ["izginil", "prodano"])
      .gte("status_spremenjen", od180)
  )).filter(veljavnaProdaja);

  // Shared per-model sale-speed map (used by vroci modeli and deal feed).
  const prodajaPoModelu = new Map<string, { dnevi: number[]; delez14: number | null }>();
  for (const o of zakljuceni) {
    const k = modelKljuc(o);
    const d = dniNaTrgu(o);
    if (!k || d === null) continue;
    const e = prodajaPoModelu.get(k) ?? { dnevi: [], delez14: null };
    e.dnevi.push(d);
    prodajaPoModelu.set(k, e);
  }
  for (const e of prodajaPoModelu.values()) {
    if (e.dnevi.length >= 10) {
      e.delez14 = Math.round((e.dnevi.filter((d) => d <= 14).length / e.dnevi.length) * 100);
    }
  }

  // ---- A1: pogajalska rezerva ------------------------------------------
  {
    const poModelu = new Map<string, { spusti: number[]; znizanih: number; vseh: number }>();
    const poTipu = { dealer: [] as number[], zasebnik: [] as number[] };
    for (const o of zakljuceni) {
      const prva = num(o.cena_prvotna_eur);
      const zadnja = num(o.cena_eur);
      if (prva === null || zadnja === null || zadnja > prva) continue;
      const spust = ((prva - zadnja) / prva) * 100;
      const k = modelKljuc(o);
      if (k) {
        const e = poModelu.get(k) ?? { spusti: [], znizanih: 0, vseh: 0 };
        e.spusti.push(spust);
        e.vseh += 1;
        if (spust > 0.1) e.znizanih += 1;
        poModelu.set(k, e);
      }
      if (o.je_dealer === true) poTipu.dealer.push(spust);
      if (o.je_dealer === false) poTipu.zasebnik.push(spust);
    }
    const modeli = [...poModelu.entries()]
      .filter(([, e]) => e.vseh >= 15)
      .map(([model, e]) => ({
        model,
        vzorec: e.vseh,
        medSpustPct: Math.round((median(e.spusti) ?? 0) * 10) / 10,
        delezZnizanih: Math.round((e.znizanih / e.vseh) * 100),
      }))
      .sort((a, b) => b.medSpustPct - a.medSpustPct);
    await zapisi(db, "pogajalska", {
      modeli: modeli.slice(0, 40),
      dealer: poTipu.dealer.length >= 20 ? Math.round((median(poTipu.dealer) ?? 0) * 10) / 10 : null,
      zasebnik: poTipu.zasebnik.length >= 20 ? Math.round((median(poTipu.zasebnik) ?? 0) * 10) / 10 : null,
      vzorecDealer: poTipu.dealer.length,
      vzorecZasebnik: poTipu.zasebnik.length,
    });
  }

  // ---- C1 + C2: trgovci --------------------------------------------------
  {
    type T = {
      naziv: string; aktivnih: number; vrednostZaloge: number; starostiDni: number[];
      prodanih90: number; dnevi: number[]; spusti: number[]; koncanih: number; ponovnih: number;
      oblezanih: number; oblezanihVrednost: number;
    };
    const trg = new Map<string, T>();
    const vzemi = (naziv: string): T => {
      const e = trg.get(naziv) ?? {
        naziv, aktivnih: 0, vrednostZaloge: 0, starostiDni: [], prodanih90: 0, dnevi: [],
        spusti: [], koncanih: 0, ponovnih: 0, oblezanih: 0, oblezanihVrednost: 0,
      };
      trg.set(naziv, e);
      return e;
    };
    const zdaj = Date.now();
    for (const o of aktivni) {
      const k = kljucTrgovca(o.prodajalec_naziv);
      if (!k) continue;
      const e = vzemi(k);
      e.aktivnih += 1;
      const c = num(o.cena_eur);
      if (c) e.vrednostZaloge += c;
      const star = (zdaj - new Date(o.first_seen).getTime()) / DAN;
      e.starostiDni.push(star);
      if (star >= 90) {
        e.oblezanih += 1;
        if (c) e.oblezanihVrednost += c;
      }
    }
    const od90 = zdaj - 90 * DAN;
    // For the relist rate the UNFILTERED finished set is needed — relists are
    // exactly what we are counting — so re-read includes them via `aktivni`'s
    // sibling query result: zakljuceni was filtered, so count relists from a
    // dedicated pass over the same 180-day window.
    const zakljuceniVsi = await preberiVse(db, (q) =>
      (q as { in: (c: string, v: string[]) => { gte: (c: string, v: string) => unknown } })
        .in("status", ["izginil", "prodano"])
        .gte("status_spremenjen", od180)
    );
    for (const o of zakljuceniVsi) {
      const k = kljucTrgovca(o.prodajalec_naziv);
      if (!k) continue;
      const e = vzemi(k);
      e.koncanih += 1;
      if (o.naslednji_oglas_id) {
        e.ponovnih += 1;
        continue; // relist: not a sale, contributes only to the relist rate
      }
      const d = dniNaTrgu(o);
      if (d !== null) {
        e.dnevi.push(d);
        if (new Date(o.status_spremenjen as string).getTime() >= od90) e.prodanih90 += 1;
      }
      const prva = num(o.cena_prvotna_eur);
      const zadnja = num(o.cena_eur);
      if (prva !== null && zadnja !== null && zadnja <= prva) e.spusti.push(((prva - zadnja) / prva) * 100);
    }
    const vrstice = [...trg.values()]
      .filter((e) => e.aktivnih >= 5 || e.koncanih >= 5)
      .map((e) => ({
        naziv: e.naziv,
        aktivnih: e.aktivnih,
        vrednostZaloge: Math.round(e.vrednostZaloge),
        povprStarostDni: e.starostiDni.length ? Math.round(median(e.starostiDni) ?? 0) : null,
        prodanih90: e.prodanih90,
        medianaDni: e.dnevi.length >= 10 ? Math.round((median(e.dnevi) ?? 0) * 10) / 10 : null,
        medSpustPct: e.spusti.length >= 10 ? Math.round((median(e.spusti) ?? 0) * 10) / 10 : null,
        relistPct: e.koncanih >= 10 ? Math.round((e.ponovnih / e.koncanih) * 100) : null,
        oblezanih: e.oblezanih,
        oblezanihVrednost: Math.round(e.oblezanihVrednost),
      }))
      .sort((a, b) => b.prodanih90 - a.prodanih90);
    await zapisi(db, "trgovci", { vrstice: vrstice.slice(0, 150), skupajTrgovcev: vrstice.length });
  }

  // ---- C3: zasebnik vs trgovec ------------------------------------------
  // Compared inside model × YEAR cells, or a dealer's brand-new Jazz gets
  // measured against a private seller's 15-year-old one and reports a fantasy
  // 90 % gap. New stock is excluded outright. The per-model figure is the
  // median of its per-year gaps.
  {
    const poCelici = new Map<string, { d: number[]; z: number[] }>();
    for (const o of aktivni) {
      const k = modelKljuc(o);
      const c = num(o.cena_eur);
      if (!k || c === null || o.je_dealer === null || o.letnik === null || jeNov(o)) continue;
      const celica = `${k}|${o.letnik}`;
      const e = poCelici.get(celica) ?? { d: [], z: [] };
      (o.je_dealer ? e.d : e.z).push(c);
      poCelici.set(celica, e);
    }
    const poModelu = new Map<string, { razlike: number[]; d: number[]; z: number[]; vzorec: number }>();
    for (const [celica, e] of poCelici) {
      if (e.d.length < 4 || e.z.length < 4) continue;
      const model = celica.split("|")[0];
      const md = median(e.d) as number;
      const mz = median(e.z) as number;
      const agg = poModelu.get(model) ?? { razlike: [], d: [], z: [], vzorec: 0 };
      agg.razlike.push(((md - mz) / md) * 100);
      agg.d.push(md);
      agg.z.push(mz);
      agg.vzorec += e.d.length + e.z.length;
      poModelu.set(model, agg);
    }
    const modeli = [...poModelu.entries()]
      .map(([model, a]) => ({
        model,
        cenaDealer: Math.round(median(a.d) as number),
        cenaZasebnik: Math.round(median(a.z) as number),
        razlikaPct: Math.round((median(a.razlike) as number) * 10) / 10,
        vzorec: a.vzorec,
      }))
      .sort((a, b) => b.vzorec - a.vzorec);
    const razlike = modeli.map((m) => m.razlikaPct);
    await zapisi(db, "zasebnik_vs_trgovec", {
      modeli: modeli.slice(0, 30),
      medRazlikaPct: razlike.length >= 5 ? Math.round((median(razlike) ?? 0) * 10) / 10 : null,
      modelov: modeli.length,
    });
  }

  // ---- E2: barve ---------------------------------------------------------
  {
    const poBarvi = new Map<string, { cene: number[]; dnevi: number[]; aktivnih: number }>();
    const norm = (b: string | null) => (b ?? "").toLowerCase().trim();
    for (const o of aktivni) {
      const b = norm(o.barva);
      if (!b) continue;
      const e = poBarvi.get(b) ?? { cene: [], dnevi: [], aktivnih: 0 };
      e.aktivnih += 1;
      const c = num(o.cena_eur);
      if (c) e.cene.push(c);
      poBarvi.set(b, e);
    }
    for (const o of zakljuceni) {
      const b = norm(o.barva);
      if (!b) continue;
      const d = dniNaTrgu(o);
      if (d === null) continue;
      const e = poBarvi.get(b) ?? { cene: [], dnevi: [], aktivnih: 0 };
      e.dnevi.push(d);
      poBarvi.set(b, e);
    }
    const vrstice = [...poBarvi.entries()]
      .filter(([, e]) => e.aktivnih >= 20)
      .map(([barva, e]) => ({
        barva,
        aktivnih: e.aktivnih,
        medCena: e.cene.length >= 20 ? Math.round(median(e.cene) ?? 0) : null,
        medDni: e.dnevi.length >= 15 ? Math.round((median(e.dnevi) ?? 0) * 10) / 10 : null,
        vzorecDni: e.dnevi.length,
      }))
      .sort((a, b) => b.aktivnih - a.aktivnih);
    await zapisi(db, "barve", { vrstice: vrstice.slice(0, 20) });
  }

  // ---- F1: struktura ponudbe (+ tedenska zgodovina) ----------------------
  {
    const delez = (f: (o: Oglas) => string | null) => {
      const m = new Map<string, number>();
      for (const o of aktivni) {
        const k = f(o);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
    };
    const letos = new Date().getFullYear();
    const ZNANA_GORIVA = new Set(["diesel", "bencinski", "hibridni", "elektricni", "električni", "plin", "cng", "lpg"]);
    const trenutna = {
      // Only recognised values, so junk like "novo" cannot appear as a fuel;
      // the page computes shares against the KNOWN set, not against all ads.
      gorivo: delez((o) => {
        const g = (o.gorivo ?? "").split(" ")[0].toLowerCase();
        return ZNANA_GORIVA.has(g) ? g : null;
      }),
      menjalnik: delez((o) => {
        const m = (o.menjalnik ?? "").split(" ")[0].toLowerCase();
        return m === "ročni" || m === "avtomatski" ? m : null;
      }),
      starost: delez((o) => {
        if (o.letnik === null) return null;
        const let_ = letos - o.letnik;
        return let_ <= 2 ? "0–2 leti" : let_ <= 5 ? "3–5 let" : let_ <= 10 ? "6–10 let" : "11+ let";
      }),
      aktivnihSkupaj: aktivni.length,
    };
    type Zgod = { tocke: { teden: string; gorivo: Record<string, number>; aktivnih: number }[] };
    const zgod = (await preberiKljuc<Zgod>(db, "struktura_zgodovina")) ?? { tocke: [] };
    const teden = (() => {
      const d = new Date();
      const zac = new Date(d.getFullYear(), 0, 1);
      const t = Math.ceil(((d.getTime() - zac.getTime()) / DAN + zac.getDay() + 1) / 7);
      return `${d.getFullYear()}-T${String(t).padStart(2, "0")}`;
    })();
    if (!zgod.tocke.some((t) => t.teden === teden)) {
      zgod.tocke.push({ teden, gorivo: trenutna.gorivo, aktivnih: aktivni.length });
      if (zgod.tocke.length > 120) zgod.tocke = zgod.tocke.slice(-120);
      await zapisi(db, "struktura_zgodovina", zgod);
    }
    await zapisi(db, "struktura", trenutna);
  }

  // ---- B1: vroci modeli --------------------------------------------------
  {
    const zOgledi = aktivni.filter((o) => o.ogledov !== null);
    const poModelu = new Map<string, { ogledi: number[]; aktivnih: number }>();
    for (const o of aktivni) {
      const k = modelKljuc(o);
      if (!k) continue;
      const e = poModelu.get(k) ?? { ogledi: [], aktivnih: 0 };
      e.aktivnih += 1;
      const on = oglediNaDan(o);
      if (on !== null) e.ogledi.push(on);
      poModelu.set(k, e);
    }
    const vrstice = [...poModelu.entries()]
      .filter(([, e]) => e.ogledi.length >= 5)
      .map(([model, e]) => ({
        model,
        medOglediNaDan: Math.round((median(e.ogledi) ?? 0) * 10) / 10,
        aktivnih: e.aktivnih,
        zOgledi: e.ogledi.length,
        delez14: prodajaPoModelu.get(model)?.delez14 ?? null,
      }))
      .sort((a, b) => b.medOglediNaDan - a.medOglediNaDan);
    await zapisi(db, "vroci_modeli", {
      vrstice: vrstice.slice(0, 30),
      zbiramo: zOgledi.length < 100,
      oglasovZOgledi: zOgledi.length,
    });
  }

  // ---- D1: regije --------------------------------------------------------
  {
    const zLokacijo = aktivni.filter((o) => regija(o.lokacija) !== null);
    // Per-model national medians first, then each region's ads measured
    // against them — otherwise a region with cheaper CARS (not cheaper prices)
    // would look like a bargain.
    const nacionalna = new Map<string, number>();
    {
      const m = new Map<string, number[]>();
      for (const o of aktivni) {
        const k = modelKljuc(o);
        const c = num(o.cena_eur);
        if (k && c) {
          const arr = m.get(k) ?? [];
          arr.push(c);
          m.set(k, arr);
        }
      }
      for (const [k, cene] of m) if (cene.length >= 10) nacionalna.set(k, median(cene) as number);
    }
    const poRegiji = new Map<string, { odstopanja: number[]; aktivnih: number; dnevi: number[] }>();
    for (const o of zLokacijo) {
      const r = regija(o.lokacija) as string;
      const e = poRegiji.get(r) ?? { odstopanja: [], aktivnih: 0, dnevi: [] };
      e.aktivnih += 1;
      const c = num(o.cena_eur);
      const nac = nacionalna.get(modelKljuc(o));
      if (c && nac) e.odstopanja.push(((c - nac) / nac) * 100);
      poRegiji.set(r, e);
    }
    for (const o of zakljuceni) {
      const r = regija(o.lokacija);
      if (!r) continue;
      const d = dniNaTrgu(o);
      if (d === null) continue;
      const e = poRegiji.get(r) ?? { odstopanja: [], aktivnih: 0, dnevi: [] };
      e.dnevi.push(d);
      poRegiji.set(r, e);
    }
    const vrstice = [...poRegiji.entries()]
      .filter(([, e]) => e.odstopanja.length >= 30)
      .map(([r, e]) => ({
        regija: r,
        aktivnih: e.aktivnih,
        odstopanjePct: Math.round((median(e.odstopanja) ?? 0) * 10) / 10,
        medDni: e.dnevi.length >= 15 ? Math.round((median(e.dnevi) ?? 0) * 10) / 10 : null,
      }))
      .sort((a, b) => a.odstopanjePct - b.odstopanjePct);
    await zapisi(db, "regije", {
      vrstice,
      zbiramo: zLokacijo.length < 1000,
      pokritost: zLokacijo.length,
      aktivnihSkupaj: aktivni.length,
    });
  }

  // ---- F2: sezona --------------------------------------------------------
  {
    const poMesecu = new Map<string, number[]>();
    for (const o of zakljuceni) {
      const d = dniNaTrgu(o);
      if (d === null || !o.status_spremenjen) continue;
      const mes = o.status_spremenjen.slice(0, 7);
      const arr = poMesecu.get(mes) ?? [];
      arr.push(d);
      poMesecu.set(mes, arr);
    }
    const tocke = [...poMesecu.entries()]
      .filter(([, ds]) => ds.length >= 20)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mesec, ds]) => ({ mesec, medDni: Math.round((median(ds) ?? 0) * 10) / 10, vzorec: ds.length }));
    await zapisi(db, "sezona", { tocke, zbiramo: tocke.length < 3 });
  }

  // ---- A4: amortizacija (top modeli) ------------------------------------
  {
    const poModelu = new Map<string, Map<number, number[]>>();
    for (const o of aktivni) {
      const k = modelKljuc(o);
      const c = num(o.cena_eur);
      if (!k || c === null || o.letnik === null) continue;
      const m = poModelu.get(k) ?? new Map<number, number[]>();
      const arr = m.get(o.letnik) ?? [];
      arr.push(c);
      m.set(o.letnik, arr);
      poModelu.set(k, m);
    }
    const modeli = [...poModelu.entries()]
      .map(([model, m]) => {
        const tocke = [...m.entries()]
          .filter(([, cene]) => cene.length >= 8)
          .sort(([a], [b]) => b - a)
          .map(([letnik, cene]) => ({ letnik, medCena: Math.round(median(cene) as number), vzorec: cene.length }));
        return { model, tocke };
      })
      .filter((x) => x.tocke.length >= 4)
      .sort((a, b) => b.tocke.reduce((s, t) => s + t.vzorec, 0) - a.tocke.reduce((s, t) => s + t.vzorec, 0));
    await zapisi(db, "amortizacija", { modeli: modeli.slice(0, 30) });
  }

  // ---- A2: indeks cen (mesecne tocke) ------------------------------------
  {
    type Indeks = { tocke: { mesec: string; medianaMedian: number; modelov: number }[] };
    const poModelu = new Map<string, number[]>();
    for (const o of aktivni) {
      const k = modelKljuc(o);
      const c = num(o.cena_eur);
      if (k && c) {
        const arr = poModelu.get(k) ?? [];
        arr.push(c);
        poModelu.set(k, arr);
      }
    }
    const mediane = [...poModelu.values()].filter((c) => c.length >= 10).map((c) => median(c) as number);
    const mesec = new Date().toISOString().slice(0, 7);
    const ind = (await preberiKljuc<Indeks>(db, "indeks_cen")) ?? { tocke: [] };
    const tocka = { mesec, medianaMedian: Math.round(median(mediane) ?? 0), modelov: mediane.length };
    const obstojeca = ind.tocke.findIndex((t) => t.mesec === mesec);
    if (obstojeca >= 0) ind.tocke[obstojeca] = tocka;
    else ind.tocke.push(tocka);
    await zapisi(db, "indeks_cen", ind);
  }


/**
 * What a kilometre and a year are worth INSIDE one cohort.
 *
 * Rather than a table of assumed depreciation, the slope is measured on the very
 * cars being compared: take every pair of peers far enough apart to be
 * informative, ask what one kilometre (or one year) cost between them, and keep
 * the median of those answers. The median is what makes it usable on real advert
 * data — a single crashed car or a typo'd price moves an average and does not
 * move this.
 *
 * Returns zeroes when the cohort has no spread to learn from, which is the
 * honest answer: no adjustment rather than an invented one.
 */
function koeficienti(vrstniki: Oglas[]): { naKm: number; naLeto: number } {
  const kmNakloni: number[] = [];
  const letoNakloni: number[] = [];

  for (let i = 0; i < vrstniki.length; i += 1) {
    for (let j = i + 1; j < vrstniki.length; j += 1) {
      const a = vrstniki[i];
      const b = vrstniki[j];
      const ca = num(a.cena_eur);
      const cb = num(b.cena_eur);
      if (ca === null || cb === null) continue;

      if (a.km !== null && b.km !== null && Math.abs(a.km - b.km) >= 20_000) {
        kmNakloni.push((ca - cb) / (a.km - b.km));
      }
      if (a.letnik !== null && b.letnik !== null && Math.abs(a.letnik - b.letnik) >= 1) {
        letoNakloni.push((ca - cb) / (a.letnik - b.letnik));
      }
    }
  }

  const naKm = kmNakloni.length >= 6 ? (median(kmNakloni) as number) : 0;
  const naLeto = letoNakloni.length >= 6 ? (median(letoNakloni) as number) : 0;

  // Sanity: mileage must not raise a price and a year must not lower one. A
  // cohort that says otherwise is telling us about its own noise, not the market.
  return {
    naKm: Number.isFinite(naKm) && naKm < 0 ? naKm : 0,
    naLeto: Number.isFinite(naLeto) && naLeto > 0 ? naLeto : 0,
  };
}

/**
 * One peer's price, restated as if that car had the candidate's mileage and year.
 *
 * Capped at 35 % of the original: a coefficient learned from eight adverts can
 * be wrong, and a wrong coefficient applied without limit would manufacture
 * "deals" out of arithmetic.
 */
function prilagojenaCena(
  vrstnik: Oglas,
  cilj: Oglas,
  k: { naKm: number; naLeto: number }
): number | null {
  const osnova = num(vrstnik.cena_eur);
  if (osnova === null) return null;

  let popravek = 0;
  if (k.naKm !== 0 && cilj.km !== null && vrstnik.km !== null) {
    popravek += k.naKm * (cilj.km - vrstnik.km);
  }
  if (k.naLeto !== 0 && cilj.letnik !== null && vrstnik.letnik !== null) {
    popravek += k.naLeto * (cilj.letnik - vrstnik.letnik);
  }

  const meja = osnova * 0.35;
  const omejen = Math.max(-meja, Math.min(meja, popravek));
  return Math.max(500, osnova + omejen);
}

  // ---- G1: deal feed -----------------------------------------------------
  {
    type Deal = {
      avtonetId: string; url: string; naziv: string | null; model: string;
      znamka: string | null; modelIme: string | null; zasluzek: number; potencial: number;
      /** Net price and the deduction flag — for a dealer this is what they pay. */
      ddvOdbitek: boolean; cenaBrezDdv: number | null;
      /** Median of DEALER adverts in the same cohort, when there were enough. */
      medianaTrgovcev: number | null; vzorecTrgovcev: number;
      odstopanjeTrgovciPct: number | null;
      /** How strict the comparison behind the numbers was. */
      strogost: string;
      /**
       * A few of the cars the median came from — price, year, mileage, link.
       *
       * The point is that the claim can be checked in ten seconds instead of
       * trusted: open two of them and it is obvious whether the comparison is
       * fair. A "deal" nobody can verify is just a number in a coloured box.
       */
      primerljivi: {
        naziv: string;
        letnik: number | null;
        km: number | null;
        cena: number;
        prilagojena: number;
        url: string;
      }[];
      cena: number; medianaKohorte: number; odstopanjePct: number; vzorec: number;
      letnik: number | null; km: number | null; jeDealer: boolean | null;
      oglediNaDan: number | null; delez14: number | null; kmAnomalija: boolean;
      tocke: number; razlogi: string[];
    };
    // Cohorts keyed by everything that has to be the SAME car, not just the same
    // model: fuel, gearbox and body. A 45 % "gap" that compares an automatic
    // estate against a manual hatchback is not a deal, it is a category error —
    // and that was the complaint about the first version of this list.
    const bazen = new Map<string, Oglas[]>();
    // The cohort key: same car, in the sense the market prices it.
    //
    // Model alone is not that. "C-Razred" holds a 115 kW C 180 and a 287 kW
    // C 43 AMG, and a 27.000 EUR C 180 measured against that mixture came out
    // "39 % below a median of 44.360 EUR" — an arithmetic fact about the wrong
    // set of cars. The engine badge is the missing piece, so it is in the key.
    const kohorta = (o: Oglas) =>
      [
        modelKljuc(o),
        motorKljuc(o),
        (o.gorivo ?? "?").split(" ")[0].toLowerCase(),
        menjalnikKljuc(o.menjalnik),
        karoserijaKljuc(o.karoserija),
      ].join("|");

    for (const o of aktivni) {
      if (!modelKljuc(o)) continue;
      const k = kohorta(o);
      const arr = bazen.get(k) ?? [];
      arr.push(o);
      bazen.set(k, arr);
    }

    const leto = new Date().getFullYear();
    const deals: Deal[] = [];

    for (const o of aktivni) {
      const cena = num(o.cena_eur);
      const mk = modelKljuc(o);
      if (!mk || cena === null || cena < 1000) continue;
      // No mileage or no year means the claim "this car is cheap for what it is"
      // cannot be made at all: those two are what "what it is" mostly consists
      // of. The first version compared a Kodiaq with unknown mileage against
      // cars with unknown mileage and called a 21.990 EUR used car 44 % under a
      // 39.199 EUR median that belonged to new stock.
      if (o.km === null || o.letnik === null) continue;
      if (jeNov(o)) continue;
      const skupina = bazen.get(kohorta(o)) ?? [];

      /**
       * Peers, narrowed step by step and only as far as the evidence allows.
       *
       * Year and engine power first (same generation, same engine), then
       * equipment overlap — a base model and a fully loaded one are different
       * products at the same price. Each relaxation is recorded, so the card can
       * say how strict the comparison behind the number actually was.
       */
      const vrstnikiZa = (letOkno: number, kwOkno: number | null, kmOkno: number | null, opremaMeja: number | null) =>
        skupina.filter((p) => {
          if (p.id === o.id || num(p.cena_eur) === null) return false;
          // Same requirement on the other side, and no new stock: a price list
          // is not a market, and an advert without mileage cannot be adjusted to
          // anything.
          if (p.km === null || p.letnik === null || jeNov(p)) return false;
          if (o.letnik !== null && p.letnik !== null && Math.abs(p.letnik - o.letnik) > letOkno) {
            return false;
          }
          if (kwOkno !== null && o.kw && p.kw && Math.abs(p.kw - o.kw) / o.kw > kwOkno) return false;
          // Mileage was not used at all before, and it is the biggest price
          // driver after age: the same car at 78.000 and at 243.000 km is easily
          // 40 % apart. A window keeps the comparison honest; the adjustment
          // below then removes what is left of the difference.
          if (kmOkno !== null && o.km && p.km && Math.abs(p.km - o.km) / o.km > kmOkno) return false;
          if (opremaMeja !== null && opremaUjemanje(o, p) < opremaMeja) return false;
          return true;
        });

      // Strict, then slightly less strict — and then nothing.
      //
      // The old ladder ended with "same model and gearbox, year ±4", which is
      // where the wrong medians came from: the loosest comparison was used
      // exactly where the data was thinnest. A deal that cannot be supported by
      // genuinely comparable cars is not shown at all.
      const stopnje: {
        let_: number;
        kw: number | null;
        km: number | null;
        oprema: number | null;
        opis: string;
      }[] = [
        { let_: 2, kw: 0.1, km: 0.35, oprema: 0.6, opis: "isti motor, podobni km in oprema" },
        { let_: 2, kw: 0.15, km: 0.5, oprema: 0.45, opis: "isti motor, podobni km" },
        { let_: 3, kw: 0.2, km: 0.6, oprema: null, opis: "isti motor" },
      ];
      let vrstniki: Oglas[] = [];
      let strogost = "";
      for (const st of stopnje) {
        vrstniki = vrstnikiZa(st.let_, st.kw, st.km, st.oprema);
        strogost = st.opis;
        if (vrstniki.length >= 8) break;
      }
      if (vrstniki.length < 8) continue;

      // Every peer restated at this car's mileage and year before the median is
      // taken. Without it the comparison silently asks "what do cars of this type
      // cost", when the question is "what does THIS car cost".
      const koef = koeficienti(vrstniki);
      const prilagojene = vrstniki
        .map((p) => prilagojenaCena(p, o, koef))
        .filter((v): v is number => v !== null);
      const medCena = median(prilagojene) as number;
      const odst = ((medCena - cena) / medCena) * 100;
      // Under 10 % below median is not a deal; over 45 % below is not a deal
      // either — it is a crashed car, an error or "cena na poziv" junk.
      if (odst < 10 || odst > 45) continue;

      // What dealers ask for the same car.
      //
      // This is the arbitrage the user actually works with: buy privately, sell
      // at the dealer level. So a private advert is measured against the DEALER
      // median of its own cohort, not against the mixed one — dealers price
      // higher for the same metal, and mixing the two hides exactly the gap
      // being looked for.
      const trgovci = vrstniki.filter((p) => p.je_dealer === true && !jeNov(p));
      const medTrgovci =
        trgovci.length >= 5
          ? (median(
              trgovci
                .map((p) => prilagojenaCena(p, o, koef))
                .filter((v): v is number => v !== null)
            ) as number)
          : null;
      const zasebnik = o.je_dealer === false;
      const odstTrgovci =
        medTrgovci !== null ? ((medTrgovci - cena) / medTrgovci) * 100 : null;

      const kmMed = median(vrstniki.map((p) => p.km).filter((x): x is number => x !== null));
      const kmAnomalija =
        o.km !== null && kmMed !== null && o.letnik !== null &&
        leto - o.letnik >= 6 && o.km < kmMed * 0.4;

      const on = oglediNaDan(o);
      const delez14 = prodajaPoModelu.get(mk)?.delez14 ?? null;
      const tocke =
        odst +
        (delez14 ?? 30) * 0.25 +
        Math.min(15, (on ?? 0) * 0.3) -
        (kmAnomalija ? 25 : 0) -
        (vrstniki.length < 12 ? 8 : 0);

      const razlogi = [
        `${Math.round(odst)} % pod mediano ${vrstniki.length} primerljivih (${Math.round(medCena).toLocaleString("sl-SI")} €) — ${strogost}${koef.naKm !== 0 || koef.naLeto !== 0 ? ", preračunano na te km in letnik" : ""}`,
      ];
      if (zasebnik && odstTrgovci !== null && odstTrgovci > 0) {
        razlogi.push(
          `zasebnik: ${Math.round(odstTrgovci)} % pod ceno trgovcev (${trgovci.length} trgovskih oglasov, mediana ${Math.round(medTrgovci as number).toLocaleString("sl-SI")} €)`
        );
      } else if (o.je_dealer === false) {
        razlogi.push("zasebnik — prostor za pogajanje");
      }
      if (delez14 !== null) razlogi.push(`${delez14} % tega modela prodanih v ≤ 14 dneh`);
      if (on !== null && on >= 20) razlogi.push(`${on} ogledov/dan — veliko zanimanja`);
      if (kmAnomalija) razlogi.push("⚠️ km izrazito pod povprečjem letnika — preverite zgodovino");

      // What the gap is actually worth, and how sellable it is.
      //
      // Percentage alone puts a 1.599 EUR Golf above a 17.990 EUR Passat with the
      // same 45 % gap, even though one is 1.300 EUR of headroom and the other
      // 14.000 EUR. "Interesting to flip" = money on the table, discounted by how
      // fast that model actually moves and by anything that smells wrong.
      //
      // For a private car the money on the table is the DEALER gap: that is the
      // price it can be resold at, not the mixed median it was found under.
      const zasluzek = Math.round(
        zasebnik && medTrgovci !== null ? medTrgovci - cena : medCena - cena
      );
      const likvidnost = 0.5 + Math.min(1, (delez14 ?? 30) / 60); // 0.5 .. 1.5
      // A 60.000 EUR gap measured against nine comparables is arithmetic, not
      // evidence — thin cohorts get scaled down instead of leading the list.
      const zanesljivost = Math.min(1, vrstniki.length / 20);
      const potencial = Math.round(
        zasluzek * likvidnost * zanesljivost * (kmAnomalija ? 0.4 : 1)
      );

      deals.push({
        avtonetId: o.avtonet_id, url: o.url, naziv: o.naziv, model: mk,
        znamka: o.znamka, modelIme: o.model, zasluzek, potencial,
        ddvOdbitek: o.ddv_odbitek === true,
        cenaBrezDdv: num(o.cena_brez_ddv_eur),
        medianaTrgovcev: medTrgovci === null ? null : Math.round(medTrgovci),
        vzorecTrgovcev: trgovci.length,
        odstopanjeTrgovciPct: odstTrgovci === null ? null : Math.round(odstTrgovci * 10) / 10,
        strogost,
        // Nearest by adjusted price, so the list shows the cars that actually
        // decided the median rather than the first few in the array.
        primerljivi: vrstniki
          .map((v) => ({ v, prilagojena: prilagojenaCena(v, o, koef) }))
          .filter((x): x is { v: Oglas; prilagojena: number } => x.prilagojena !== null)
          .sort((a, b) => Math.abs(a.prilagojena - medCena) - Math.abs(b.prilagojena - medCena))
          .slice(0, 4)
          .map((x) => ({
            naziv: (x.v.naziv ?? mk).slice(0, 60),
            letnik: x.v.letnik,
            km: x.v.km,
            cena: Math.round(num(x.v.cena_eur) as number),
            prilagojena: Math.round(x.prilagojena),
            url: x.v.url,
          })),
        cena, medianaKohorte: Math.round(medCena), odstopanjePct: Math.round(odst * 10) / 10,
        vzorec: vrstniki.length, letnik: o.letnik, km: o.km, jeDealer: o.je_dealer,
        oglediNaDan: on, delez14, kmAnomalija, tocke: Math.round(tocke * 10) / 10, razlogi,
      });
    }
    deals.sort((a, b) => b.tocke - a.tocke);

    // The same car is often posted twice (a dealer re-uploads it, or one advert
    // sits under two IDs). Identical title, price, mileage and year is that, not
    // two opportunities — and unfiltered it wastes two slots in a row.
    const videni = new Set<string>();
    const brezDvojnikov = deals.filter((d) => {
      const k = `${(d.naziv ?? d.model).trim().toLowerCase()}|${d.cena}|${d.km ?? "?"}|${d.letnik ?? "?"}`;
      if (videni.has(k)) return false;
      videni.add(k);
      return true;
    });

    // Kept generously wide (was 20) so the brand/model/year filters on the Posli
    // page have something to filter: a Renault-only view of the top twenty is
    // usually empty. Roughly 150 KB of JSON, no extra queries.
    //
    // Two rankings, then their union: cutting by percentage score alone would
    // drop exactly the expensive cars with the largest euro headroom, which are
    // the ones worth buying to resell.
    const izbrani = new Map<string, Deal>();
    for (const d of brezDvojnikov.slice(0, 250)) izbrani.set(d.avtonetId, d);
    const poPotencialu = [...brezDvojnikov].sort((a, b) => b.potencial - a.potencial);
    for (const d of poPotencialu.slice(0, 150)) izbrani.set(d.avtonetId, d);
    // A per-brand quota on top of the global cut. Without it the list is 64 %
    // Volkswagen (the brand with the fattest cohorts), and the brand filter on
    // the Posli page offers thirteen options for a market of sixty.
    const naZnamko = new Map<string, number>();
    for (const d of poPotencialu) {
      const z = d.znamka ?? "?";
      const n = naZnamko.get(z) ?? 0;
      if (n >= 15) continue;
      naZnamko.set(z, n + 1);
      izbrani.set(d.avtonetId, d);
    }
    const shranjeni = [...izbrani.values()].sort((a, b) => b.potencial - a.potencial);

    await zapisi(db, "deal_feed", { deals: shranjeni, pregledanih: aktivni.length });
  }

  // ---- seznam znamk in modelov (za filtrirne obrazce) --------------------
  {
    const poZnamki = new Map<string, Map<string, number>>();
    for (const o of aktivni) {
      if (!o.znamka || !o.model || o.model.length > 40) continue;
      const m = poZnamki.get(o.znamka) ?? new Map<string, number>();
      m.set(o.model, (m.get(o.model) ?? 0) + 1);
      poZnamki.set(o.znamka, m);
    }
    const znamke = [...poZnamki.entries()]
      .map(([znamka, m]) => ({
        znamka,
        modeli: [...m.entries()]
          .filter(([, n]) => n >= 3)
          .sort(([a], [b]) => a.localeCompare(b, "sl"))
          .map(([model]) => model),
      }))
      .filter((z) => z.modeli.length > 0)
      .sort((a, b) => a.znamka.localeCompare(b.znamka, "sl"));
    await zapisi(db, "modeli_seznam", { znamke });
  }

  await zapisi(db, "meta", {
    aktivnih: aktivni.length,
    zakljucenihVeljavnih: zakljuceni.length,
    trajanjeMs: Date.now() - zacetek,
  });
  log("info", "statistika izracunana", {
    aktivnih: aktivni.length,
    zakljucenih: zakljuceni.length,
    ms: Date.now() - zacetek,
  });
}
