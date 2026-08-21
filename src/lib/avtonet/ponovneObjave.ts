/**
 * Združevanje ponovnih objav istega fizičnega avta.
 *
 * Trgovci oglas redno izbrišejo in objavijo znova (svežina na vrhu seznama).
 * Vsaka taka objava je v bazi svoj zapis s svojim izginotjem — brez združevanja
 * je en Ford Focus, objavljen trikrat, štel kot "trije avti, vsak prodan v dveh
 * dneh", kar je pokvarilo vsako statistiko hitrosti.
 *
 * Ključ istega avta: naziv + kilometri + letnik. Cena namenoma NI v ključu,
 * ker se med ponovnimi objavami spreminja — ravno to je zanimivo. VIN bi bil
 * močnejši, a ga ima le petina oglasov; kjer obstaja, ima prednost.
 *
 * Združeni avto: predstavlja ga ZADNJA objava (zadnja cena pred dokončnim
 * izginotjem), dnevi na trgu pa tečejo od PRVE objave — prejšnja izginotja niso
 * bila prodaja, le umik.
 */

export type ZaZdruzitev = {
  id: string;
  avtonet_id: string;
  naziv: string | null;
  km: number | null;
  letnik: number | null;
  vin?: string | null;
  first_seen: string;
  status_spremenjen: string | null;
};

export type Zdruzeno<T> = {
  /** Zadnja objava — njena cena je zadnja beseda tega avta. */
  vrstica: T;
  /** Kolikokrat je bil isti avto objavljen (1 = brez ponovitev). */
  objav: number;
  /** first_seen najzgodnejše objave — od tu tečejo dnevi na trgu. */
  prvaObjava: string;
  /** Vsi id-ji objav — za zgodovino cen čez vse. */
  ids: string[];
  /** Vsi avtonet id-ji — za PDF arhiv čez vse objave. */
  avtonetIds: string[];
};

function kljuc(v: ZaZdruzitev): string {
  if (v.vin) return `vin:${v.vin}`;
  const naziv = (v.naziv ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  if (!naziv || v.km === null) return `id:${v.id}`;
  return `${naziv}|${v.km}|${v.letnik ?? "?"}`;
}

export function zdruziPonovneObjave<T extends ZaZdruzitev>(vrstice: T[]): Zdruzeno<T>[] {
  const skupine = new Map<string, T[]>();
  for (const v of vrstice) {
    const k = kljuc(v);
    const s = skupine.get(k) ?? [];
    s.push(v);
    skupine.set(k, s);
  }

  const out: Zdruzeno<T>[] = [];
  for (const clani of skupine.values()) {
    const poIzginotju = [...clani].sort((a, b) =>
      (a.status_spremenjen ?? "").localeCompare(b.status_spremenjen ?? "")
    );
    const zadnja = poIzginotju[poIzginotju.length - 1];
    const prva = [...clani].sort((a, b) => a.first_seen.localeCompare(b.first_seen))[0];
    out.push({
      vrstica: zadnja,
      objav: clani.length,
      prvaObjava: prva.first_seen,
      ids: clani.map((c) => c.id),
      avtonetIds: clani.map((c) => c.avtonet_id),
    });
  }
  return out;
}

/** Dnevi na trgu združenega avta: od prve objave do zadnjega izginotja. */
export function dniNaTrguZdruzeno(z: Zdruzeno<ZaZdruzitev>): number | null {
  const konec = z.vrstica.status_spremenjen;
  if (!konec) return null;
  const d = (new Date(konec).getTime() - new Date(z.prvaObjava).getTime()) / 86_400_000;
  return d >= 0 && d < 3000 ? Math.round(d) : null;
}
