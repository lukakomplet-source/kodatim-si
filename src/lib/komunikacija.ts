import "server-only";
import { preberiCakaKodaTim } from "@/lib/danes";
import type { Postavka } from "@/lib/prodajna-ekipa";

/** Ime panik osnutka (.eml v korenu mape): brez poševnic in znaka NUL. Isto preverjanje v akcijah in na strani ogleda. */
export const IME_OSNUTKA = /^[^/\\\0]{1,200}\.eml$/;

/**
 * Komunikacija (faza 5, 3. 11. 2026): ENA številka »čaka« za Danes, Komunikacijo in značko v meniju.
 *
 * čaka = maili, ki jih človek lahko obdela zdaj z enim klikom: Odobri/Zavrni, Pošlji ali Odpri v Outlooku.
 * Kar čaka na kaj drugega (najprej klic, dogovorjeni dan, prejšnji korak), ni v številki, ampak zraven.
 * - KodaTim: Harvey KodaTim GET /api/caka (harvey/ekipa.py caka), ista funkcija kot Telegram ob 16:00.
 * - Kompletko: Harvey Kompletko GET /api/osnutki-panik (panik_osnutki.cakajo) »zaPoslat«; »najprej klic« in
 *   »dogovorjen klic« sta zraven kot »čaka na klic«.
 * Vir, ki ne odgovori, je null (»ni podatka«), nikoli 0. Vsi bralci gredo skozi isti 30-sekundni spomin, zato
 * Danes, Komunikacija in meni kažejo isto število; akcije ga po pošiljanju pozabijo (pozabiCaka).
 */

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";
const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";
const SPOMIN_MS = 30_000;

export type CakaKodaTimH = {
  skupaj: number;
  odobritev: string[];
  outlook: string[];
  po_vrsti: { prvi: number; follow_up: number; odgovor: number };
  caka_na_prej: number;
  ustvarjeno: string;
};

/** Vrstica iz /api/caka?podrobno=1: osnutek iz Odobritve plus kje čaka. */
export type CakaVrstica = Postavka & {
  kje: "odobritev" | "outlook";
  odprt: boolean;
  prospect_id: string;
  email: string;
};

export type CakaPosel = {
  /** Število, ki ga človek lahko obdela zdaj; null = ni podatka. */
  caka: number | null;
  /** Zraven, ne v številki: KodaTim follow-upi za neposlanim prvim mailom, Kompletko »najprej klic« in dogovorjeni. */
  zraven: number | null;
  /** KodaTim: Harvey KodaTim še teče brez /api/caka, številka je po starem pravilu (Odobritev + mape). */
  staro?: boolean;
};

export type Caka = {
  kodatim: CakaPosel | null;
  kompletko: CakaPosel | null;
};

type Spomin<T> = { cas: number; obljuba: Promise<T> };
const g = globalThis as typeof globalThis & {
  __kodatimCaka?: { kodatim?: Spomin<CakaPosel>; kompletko?: Spomin<CakaPosel> };
};
function spomin() {
  g.__kodatimCaka ??= {};
  return g.__kodatimCaka;
}

/** Po odobritvi, pošiljanju ali odprtju v Outlooku: naslednji izris prebere številko znova. */
export function pozabiCaka(): void {
  g.__kodatimCaka = {};
}

async function json<T>(url: string, ms: number): Promise<{ status: number; data: T | null }> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return { status: r.status, data: r.ok ? ((await r.json()) as T) : null };
  } catch {
    return { status: 0, data: null };
  }
}

async function berKodaTim(): Promise<CakaPosel> {
  const { status, data } = await json<CakaKodaTimH>(`${HARVEY}/api/caka`, 4_000);
  if (data && typeof data.skupaj === "number") return { caka: data.skupaj, zraven: data.caka_na_prej ?? 0 };
  // Harvey KodaTim before its restart has no /api/caka (404): the old rule, so the number is not missing.
  if (status === 404) {
    const staro = await preberiCakaKodaTim().catch(() => null);
    if (staro) return { caka: staro.caka, zraven: null, staro: true };
  }
  return { caka: null, zraven: null };
}

async function berKompletko(): Promise<CakaPosel> {
  const { data } = await json<{ caka: number; zaPoslat: number }>(`${HARVEY_KOMPLETKO}/api/osnutki-panik`, 4_000);
  if (!data || typeof data.caka !== "number") return { caka: null, zraven: null };
  const zaPoslat = typeof data.zaPoslat === "number" ? data.zaPoslat : data.caka;
  return { caka: zaPoslat, zraven: Math.max(0, data.caka - zaPoslat) };
}

function izSpomina(kljuc: "kodatim" | "kompletko", beri: () => Promise<CakaPosel>): Promise<CakaPosel> {
  const s = spomin();
  const zdaj = Date.now();
  const v = s[kljuc];
  if (v && zdaj - v.cas < SPOMIN_MS) return v.obljuba;
  const obljuba = beri();
  s[kljuc] = { cas: zdaj, obljuba };
  // A failed read is not remembered for long: the next render asks again.
  obljuba.then((r) => {
    if (r.caka === null && s[kljuc]?.obljuba === obljuba) s[kljuc] = { cas: zdaj - SPOMIN_MS + 5_000, obljuba };
  });
  return obljuba;
}

/** Ena številka »čaka« za posla, ki ju uporabnik gleda (po stikalu); posel, ki ga ne gleda, je null. */
export async function preberiCaka(posla: { kodatim: boolean; kompletko: boolean }): Promise<Caka> {
  const [kodatim, kompletko] = await Promise.all([
    posla.kodatim ? izSpomina("kodatim", berKodaTim) : Promise.resolve(null),
    posla.kompletko ? izSpomina("kompletko", berKompletko) : Promise.resolve(null),
  ]);
  return { kodatim, kompletko };
}

/** Vsota za značko; null, če kateri od gledanih virov ne odgovori. */
export function skupajCaka(c: Caka): number | null {
  const deli = [c.kodatim, c.kompletko].filter((x): x is CakaPosel => x !== null);
  if (deli.some((d) => d.caka === null)) return null;
  return deli.reduce((s, d) => s + (d.caka ?? 0), 0);
}

/** KodaTim vrstice, ki čakajo (za Pregled); null, če Harvey KodaTim ne odgovori ali še nima /api/caka. */
export async function preberiCakaKodaTimVrstice(): Promise<
  (CakaKodaTimH & { seznam: CakaVrstica[] }) | { napaka: "ni" | "staro" }
> {
  const { status, data } = await json<CakaKodaTimH & { seznam: CakaVrstica[] }>(
    `${HARVEY}/api/caka?podrobno=1`,
    15_000,
  );
  if (data && Array.isArray(data.seznam)) return data;
  return { napaka: status === 404 ? "staro" : "ni" };
}

// ── Harvey Kompletko: pošiljanje panik osnutkov iz admina (harvey/posiljanje_panik.py) ──

export type TestOblike = "ni" | "poslan" | "potrjen" | "zavrnjen";

export type OsnutekPanik = {
  ime: string;
  za: string;
  zadeva: string;
  vrsta: "prvi" | "follow_up";
  ustvarjeno: string;
  domena: string;
  podjetje: string;
  najprejKlic: boolean;
  zadrzan: boolean;
  /** Zakaj danes ne more iti po stanju podjetja (Harvey panik_osnutki.ovire, isto pravilo kot številka »čaka«). */
  ovire?: string[];
  oblika: string;
  otisk: string;
  test: TestOblike;
  odklenjena: boolean;
  /** Pravila vsebine, ki jih osnutek krši (prazno = v redu). */
  vsebina: string[];
};

export type PostavkaPosla = {
  ime: string;
  domena: string;
  za: string;
  zadeva: string;
  oblika: string;
  stanje: "caka" | "poslano" | "preskoceno" | "napaka" | "ustavljeno";
  razlog?: string;
  opozorila?: string[];
  message_id?: string;
  v_poslano?: boolean;
  premaknjen?: string;
  cas?: string;
};

export type PoselPanik = {
  id: string;
  ustvarjen: string;
  kdo: string;
  stanje: "tece" | "koncano" | "napaka" | "prekinjeno";
  koncan: string | null;
  postavke: PostavkaPosla[];
};

export type VnosDnevnika = {
  id: number;
  cas: string;
  kdo: string;
  vrsta: string;
  komu: string;
  domena: string;
  zadeva: string;
  oblika: string;
  ime: string;
  razlog: string;
};

export type StanjePanik = {
  osnutki: OsnutekPanik[];
  posel: PoselPanik | null;
  tece: boolean;
  dnevnik: VnosDnevnika[];
  presledekS: number;
  najvec: number;
  testNaslov: string;
  caka: number;
  zaPoslat: number;
};

/** Stanje pošiljanja panik osnutkov; "staro", če Harvey Kompletko še teče brez teh poti (pred ponovnim zagonom). */
export async function preberiStanjePanik(): Promise<StanjePanik | "staro" | null> {
  const { status, data } = await json<StanjePanik>(`${HARVEY_KOMPLETKO}/api/posiljanje-panik/stanje`, 8_000);
  if (data && Array.isArray(data.osnutki)) return data;
  return status === 404 ? "staro" : null;
}

/** Stari seznam panik osnutkov (GET /api/osnutki-panik), ko pošiljanja iz admina še ni. */
export async function preberiOsnutkePanik(): Promise<
  { caka: number; zaPoslat: number; osnutki: Omit<OsnutekPanik, "oblika" | "otisk" | "test" | "odklenjena" | "vsebina">[] } | null
> {
  const { data } = await json<{
    caka: number;
    zaPoslat: number;
    osnutki: Omit<OsnutekPanik, "oblika" | "otisk" | "test" | "odklenjena" | "vsebina">[];
  }>(`${HARVEY_KOMPLETKO}/api/osnutki-panik`, 4_000);
  return data && Array.isArray(data.osnutki) ? data : null;
}

/** POST na Harvey Kompletko; vrne status in telo (ali status 0, ko ne odgovori). */
export async function poKompletku<T>(pot: string, telo: unknown, ms = 30_000): Promise<{ status: number; data: T | null }> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}${pot}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(ms),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    return { status: r.status, data: (await r.json().catch(() => null)) as T | null };
  } catch {
    return { status: 0, data: null };
  }
}

export async function preberiPoselPanik(id: string): Promise<PoselPanik | null> {
  const { data } = await json<PoselPanik>(`${HARVEY_KOMPLETKO}/api/posiljanje-panik/posel/${encodeURIComponent(id)}`, 5_000);
  return data && Array.isArray(data.postavke) ? data : null;
}

// ── Poslano in Odgovori ──

export type PoslanoKodaTim = {
  id: string;
  prospect_id: string;
  podjetje: string;
  email: string;
  domena: string;
  zadeva: string;
  korak: number;
  vrsta: "prvi" | "follow_up" | "odgovor";
  poslano: string | null;
  mapa: string;
  kanal: "posiljatelj" | "outlook";
};

export type PoslanoKompletko = {
  domena: string;
  podjetje: string;
  email: string;
  varianta: string;
  stanje: string;
  poslano: string | null;
  zadnje_poslano: string | null;
  stevilo_poslanih: number;
  zadeva: string;
};

export type IzAdmina = {
  id?: number;
  message_id?: string;
  cas: string;
  kdo: string;
  komu: string;
  domena: string;
  zadeva: string;
  oblika: string;
  ime: string;
  v_poslano: number;
};

export type OdgovorKodaTim = {
  id: string;
  prospect_id: string;
  podjetje: string;
  email: string;
  domena: string;
  kdaj: string | null;
  namen: string;
  faza: string;
  stanje: string;
  odlomek: string;
  mapa: string;
};

export type OdgovorKompletko = {
  domena: string;
  podjetje: string;
  email: string;
  stanje: string;
  kdaj: string | null;
  odlomek: string;
  varianta: string;
};

export async function preberiPoslanoKodaTim(n = 150): Promise<{ skupaj: number; poslano: PoslanoKodaTim[] } | null> {
  const { data } = await json<{ skupaj: number; poslano: PoslanoKodaTim[] }>(
    `${HARVEY}/api/komunikacija/poslano?n=${n}`,
    6_000,
  );
  return data && Array.isArray(data.poslano) ? data : null;
}

export async function preberiOdgovoreKodaTim(n = 150): Promise<{ skupaj: number; odgovori: OdgovorKodaTim[] } | null> {
  const { data } = await json<{ skupaj: number; odgovori: OdgovorKodaTim[] }>(
    `${HARVEY}/api/komunikacija/odgovori?n=${n}`,
    6_000,
  );
  return data && Array.isArray(data.odgovori) ? data : null;
}

/** Kompletko Poslano; pred ponovnim zagonom Harveyja Kompletko iz /api/posiljanja (ista polja, brez »iz admina«). */
export async function preberiPoslanoKompletko(
  n = 200,
): Promise<{ skupaj: number; poslano: PoslanoKompletko[]; izAdmina: IzAdmina[] } | null> {
  const { status, data } = await json<{ skupaj: number; poslano: PoslanoKompletko[]; izAdmina: IzAdmina[] }>(
    `${HARVEY_KOMPLETKO}/api/komunikacija/poslano?n=${n}`,
    6_000,
  );
  if (data && Array.isArray(data.poslano)) return { ...data, izAdmina: data.izAdmina ?? [] };
  if (status !== 404) return null;
  const staro = await json<{ podjetja: PoslanoKompletko[] }>(`${HARVEY_KOMPLETKO}/api/posiljanja`, 6_000);
  if (!staro.data || !Array.isArray(staro.data.podjetja)) return null;
  const poslano = [...staro.data.podjetja]
    .sort((a, b) => (b.zadnje_poslano || b.poslano || "").localeCompare(a.zadnje_poslano || a.poslano || ""))
    .slice(0, n);
  return { skupaj: staro.data.podjetja.length, poslano, izAdmina: [] };
}

export async function preberiOdgovoreKompletko(n = 200): Promise<{ skupaj: number; odgovori: OdgovorKompletko[] } | null> {
  const { status, data } = await json<{ skupaj: number; odgovori: OdgovorKompletko[] }>(
    `${HARVEY_KOMPLETKO}/api/komunikacija/odgovori?n=${n}`,
    6_000,
  );
  if (data && Array.isArray(data.odgovori)) return data;
  if (status !== 404) return null;
  const staro = await json<{
    podjetja: (PoslanoKompletko & { odgovor: string | null; odgovor_odlomek: string })[];
  }>(`${HARVEY_KOMPLETKO}/api/posiljanja`, 6_000);
  if (!staro.data || !Array.isArray(staro.data.podjetja)) return null;
  const odgovori = staro.data.podjetja
    .filter((p) => p.odgovor)
    .map((p) => ({
      domena: p.domena,
      podjetje: p.podjetje,
      email: p.email,
      stanje: p.stanje,
      kdaj: p.odgovor,
      odlomek: p.odgovor_odlomek ?? "",
      varianta: p.varianta,
    }))
    .sort((a, b) => (b.kdaj ?? "").localeCompare(a.kdaj ?? ""))
    .slice(0, n);
  return { skupaj: odgovori.length, odgovori };
}

/** En mail za »Poglej mail« (Harvey: baza, predal ali osnutek). */
export type MailZaOgled = {
  za: string;
  od?: string;
  zadeva: string;
  datum?: string;
  html: string;
  priloge?: ({ indeks: number; ime: string; tip: string; velikost: number } | string)[];
};

export async function preberiMail(
  vir: "kodatim-mail" | "kodatim-pogovor" | "kompletko-odgovor" | "kompletko-osnutek" | "kompletko-poslano",
  kljuc: string,
): Promise<{ status: number; data: unknown }> {
  const pot = {
    "kodatim-mail": `${HARVEY}/api/komunikacija/mail/`,
    "kodatim-pogovor": `${HARVEY}/api/komunikacija/pogovor/`,
    "kompletko-odgovor": `${HARVEY_KOMPLETKO}/api/komunikacija/odgovor/`,
    "kompletko-osnutek": `${HARVEY_KOMPLETKO}/api/posiljanje-panik/predogled/`,
    "kompletko-poslano": `${HARVEY_KOMPLETKO}/api/komunikacija/poslan/`,
  }[vir];
  return json(`${pot}${encodeURIComponent(kljuc)}`, 60_000);
}
