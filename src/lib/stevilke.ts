import "server-only";

/**
 * Številke › Dan in teden (faza 7, 3. 11. 2026): samo iz vpisanih dogodkov, nič ocenjeno.
 * - KodaTim: Harvey KodaTim GET /api/stevilke (isti števci kot poročilo ob 16:00), danes in zadnjih 7 dni.
 * - Kompletko: Harvey Kompletko GET /api/stevilke (klici po osebi iz prodaja_dnevnik, maili po varianti).
 * Vir, ki ne odgovori, je null (»ni podatka«), nikoli 0.
 */

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";
const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

export type StevciKodaTim = {
  poslano: number;
  prvih: number;
  odgovorov: number;
  zanimanje: number;
  vprasanj: number;
  odjav: number;
  odbitij: number;
  kontaktov: number;
  podjetij: number;
  osnutkov: number;
  raziskanih: number;
  preskocenih: number;
  zavrnjenih: number;
  outlook: number;
  ogledov: number;
};

export type StevilkeKodaTim = {
  danes: StevciKodaTim;
  teden: StevciKodaTim;
  caka: { skupaj: number; odobritev: number; outlook: number };
};

export type KlicniStevci = {
  klici: number;
  dvignjeni: number;
  sestanki: number;
  posli: number;
  klic_v_sestanek: string;
  sestanek_v_posel: string;
};

export type StevilkeKompletko = {
  obdobje: { od: string; dni: number; skupaj: KlicniStevci; po_osebi: Record<string, KlicniStevci> };
  variante: Record<string, { poslano: number; odgovori: number; sestanki: number; kupili: number }>;
  /** Boomerang (3. 11.): njihovi odgovori na »Kaj bi moralo biti vključeno, da bi rekli da?«; starejši Harvey jih nima. */
  vkljuceno?: { cas: string; domena: string; kdo: string; ugovor: string; besedilo: string }[];
};

async function beri<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
    if (!r.ok) return null;
    const d = (await r.json()) as T & { napaka?: string };
    return d && !d.napaka ? d : null;
  } catch {
    return null;
  }
}

export async function preberiStevilkeKodaTimTeden(): Promise<StevilkeKodaTim | null> {
  const d = await beri<StevilkeKodaTim>(`${HARVEY}/api/stevilke`);
  return d?.danes && d.teden ? d : null;
}

export async function preberiStevilkeKompletkoTeden(dni = 7): Promise<StevilkeKompletko | null> {
  const d = await beri<StevilkeKompletko>(`${HARVEY_KOMPLETKO}/api/stevilke?dni=${dni}`);
  return d?.obdobje?.skupaj ? d : null;
}
