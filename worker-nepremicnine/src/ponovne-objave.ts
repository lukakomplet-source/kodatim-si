import type { Db } from "./db.js";

/**
 * PONOVNE OBJAVE — SKRITA ZNIŽANJA CEN.
 *
 * Prodajalec, ki ceno spusti, oglasa pogosto ne popravi, ampak ga umakne in
 * čez nekaj dni objavi znova — z novo številko in nižjo ceno. Za nas je bil to
 * NOV oglas z isto prvotno in trenutno ceno, torej brez znižanja; med posli se
 * ni pojavil nikoli. Analiza 28. 9. 2026: na siolu 63 takih cenejših vrnitev
 * proti 83 vidnim znižanjem — skoraj polovica znižanj je bila nevidna.
 *
 * PAR je izginuli oglas in nov oglas, ki:
 *   - sta na ISTEM viru, pri isti agenciji (ali oba brez nje), istega tipa in
 *     posla, v istem kraju, s površino na kvadratni meter enako;
 *   - nov se je pojavil med 3 dnevi pred in 30 dnevi po zadnjem videnju starega;
 *   - cena novega je med −40 % in +20 % stare (izven tega gre za drug objekt ali
 *     preklop prodaja→najem, kakršen je dal "255.000 € → 600 €").
 *
 * ENOLIČNOST JE OBVEZNA NA OBEH STRANEH. V novogradnji ima ista agencija v
 * istem kraju lahko pet enakih stanovanj po isti ceni; če bi stari oglas
 * ustrezal dvema novima (ali nov dvema staroma), para ne zapišemo — zamenjava
 * dveh stanovanj je hujša napaka od izpuščene ponovne objave.
 *
 * Dejanje: novemu oglasu se `cena_prvotna_eur` postavi na prvotno ceno starega,
 * če je bila višja — izračunani `padec_pct` tako pokaže pravo znižanje, oglas
 * pride med znižane in v posle. Vsak par dobi dogodek `ponovna_objava` z
 * obema cenama in povezavo na stari oglas; ta dogodek je tudi varovalka, da se
 * isti par ne obdela dvakrat.
 */

type Oglas = {
  id: string;
  vir: string;
  url: string;
  agencija: string | null;
  tip: string | null;
  posel: string;
  kraj: string | null;
  povrsina_m2: number | string | null;
  cena_eur: number | string | null;
  cena_prvotna_eur: number | string | null;
  first_seen: string;
  last_seen: string;
};

const DAN = 86_400_000;

export function kljucOglasa(o: Oglas): string | null {
  const m2 = o.povrsina_m2 === null ? NaN : Math.round(Number(o.povrsina_m2));
  if (!Number.isFinite(m2) || m2 <= 0 || !o.tip || !o.kraj) return null;
  return [o.vir, (o.agencija ?? "").trim().toLowerCase(), o.tip, o.posel, m2, o.kraj.trim().toLowerCase()].join("|");
}

export type Par = { star: Oglas; nov: Oglas };

/** Čisto ujemanje — brez baze, da ga je mogoče preizkusiti. */
export function najdiPare(izginuli: Oglas[], novi: Oglas[]): Par[] {
  const poKljucu = new Map<string, Oglas[]>();
  for (const n of novi) {
    const k = kljucOglasa(n);
    if (!k) continue;
    poKljucu.set(k, [...(poKljucu.get(k) ?? []), n]);
  }
  const kandidati: Par[] = [];
  for (const s of izginuli) {
    const k = kljucOglasa(s);
    const cenaS = Number(s.cena_eur);
    if (!k || !Number.isFinite(cenaS) || cenaS <= 0) continue;
    const zadnjic = new Date(s.last_seen).getTime();
    for (const n of poKljucu.get(k) ?? []) {
      if (n.id === s.id) continue;
      const kdaj = new Date(n.first_seen).getTime();
      if (kdaj < zadnjic - 3 * DAN || kdaj > zadnjic + 30 * DAN) continue;
      const razmerje = Number(n.cena_eur) / cenaS;
      if (!Number.isFinite(razmerje) || razmerje < 0.6 || razmerje > 1.2) continue;
      kandidati.push({ star: s, nov: n });
    }
  }
  // Enoličnost na obeh straneh.
  const naStari = new Map<string, number>();
  const naNovi = new Map<string, number>();
  for (const p of kandidati) {
    naStari.set(p.star.id, (naStari.get(p.star.id) ?? 0) + 1);
    naNovi.set(p.nov.id, (naNovi.get(p.nov.id) ?? 0) + 1);
  }
  return kandidati.filter((p) => naStari.get(p.star.id) === 1 && naNovi.get(p.nov.id) === 1);
}

const POLJA = "id, vir, url, agencija, tip, posel, kraj, povrsina_m2, cena_eur, cena_prvotna_eur, first_seen, last_seen";

/** Listanje z ORDER BY (17. 9. 2026: brez njega je ista hiša prišla trikrat v feed). */
async function beri(db: Db, stolpec: "last_seen" | "first_seen", od: string, samoIzginuli: boolean): Promise<Oglas[]> {
  const vse: Oglas[] = [];
  for (let zacetek = 0; ; zacetek += 1000) {
    let q = db.from("nep_oglasi").select(POLJA).gte(stolpec, od).not("cena_eur", "is", null);
    if (samoIzginuli) q = q.eq("status", "izginil");
    const { data, error } = await q.order("id").range(zacetek, zacetek + 999);
    if (error) throw new Error(`Branje oglasov: ${error.message}`);
    vse.push(...((data ?? []) as unknown as Oglas[]));
    if (!data || data.length < 1000) break;
  }
  return vse;
}

export async function zaznajPonovneObjave(
  db: Db,
  log: (m: string) => void,
  moznosti: { dni?: number; suho?: boolean } = {}
): Promise<{ parov: number; cenejsih: number; zapisanih: number }> {
  const dni = moznosti.dni ?? 45;
  const od = new Date(Date.now() - dni * DAN).toISOString();
  const izginuli = await beri(db, "last_seen", od, true);
  if (izginuli.length === 0) return { parov: 0, cenejsih: 0, zapisanih: 0 };
  const novi = await beri(db, "first_seen", od, false);
  const pari = najdiPare(izginuli, novi);

  // Kar je že obdelano, preskočimo (dogodek je varovalka).
  const zeObdelani = new Set<string>();
  for (let i = 0; i < pari.length; i += 200) {
    const { data } = await db
      .from("nep_spremembe")
      .select("oglas_id")
      .eq("tip", "ponovna_objava")
      .in("oglas_id", pari.slice(i, i + 200).map((p) => p.nov.id));
    for (const d of data ?? []) zeObdelani.add(d.oglas_id as string);
  }

  let cenejsih = 0;
  let zapisanih = 0;
  for (const { star, nov } of pari) {
    const cenaS = Number(star.cena_eur);
    const cenaN = Number(nov.cena_eur);
    const prvotnaS = star.cena_prvotna_eur !== null ? Number(star.cena_prvotna_eur) : cenaS;
    const prvotnaN = nov.cena_prvotna_eur !== null ? Number(nov.cena_prvotna_eur) : cenaN;
    const prvotna = Math.max(prvotnaS, cenaS, prvotnaN);
    if (cenaN < cenaS) cenejsih += 1;
    if (zeObdelani.has(nov.id) || moznosti.suho) continue;

    if (prvotna > prvotnaN) {
      const { error } = await db.from("nep_oglasi").update({ cena_prvotna_eur: prvotna }).eq("id", nov.id);
      if (error) throw new Error(`Prvotna cena ${nov.id}: ${error.message}`);
    }
    const { error: e } = await db.from("nep_spremembe").insert({
      oglas_id: nov.id,
      tip: "ponovna_objava",
      staro: { oglas_id: star.id, url: star.url, cena: cenaS, prvotna: prvotnaS, zadnjic_viden: star.last_seen },
      novo: { cena: cenaN, prvotna_prenesena: prvotna > prvotnaN ? prvotna : null },
    });
    if (e) throw new Error(`Dogodek ponovne objave ${nov.id}: ${e.message}`);
    zapisanih += 1;
  }
  log(`ponovne objave: ${pari.length} enoličnih parov, od tega ${cenejsih} cenejših, ${zapisanih} novih zapisanih${moznosti.suho ? " (SUHO)" : ""}`);
  return { parov: pari.length, cenejsih, zapisanih };
}
