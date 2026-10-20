import "server-only";
import type { Faza } from "./priloznostiFaze";

export type { Faza };

/**
 * Raziskovalec priložnosti (Harvey, harvey/priloznosti.py, 127.0.0.1:5555):
 * raziskava je vprašanje s proračunom, ki teče v krogih. V vsakem krogu agent
 * z orodji išče in bere splet (koda zapiše vsak dejanski korak), koda preveri
 * vsak navedeni odlomek na strani, neodvisni ocenjevalec napade rezultat.
 * Tu se samo bere in pošilja Lukove odločitve; nič se ne izmišljuje.
 */

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";
const ID = /^r_[0-9a-f]{10}$/;

export type StanjeRaziskave = "caka" | "v_teku" | "koncano" | "nedokoncano" | "prekinjeno" | "ustavljeno" | "napaka";
export type Izid = "ZAVRNI" | "VALIDIRAJ" | "NEZNANO" | "";

export type PovzetekRaziskave = {
  id: string;
  vprasanje: string;
  stanje: StanjeRaziskave;
  faza: Faza;
  izid: Izid;
  krogov: number;
  najvec_krogov: number;
  gotovost: string;
  dokazov: number;
  preverjenih: number;
  domen: number;
  orodij: number;
  trajanje_s: number;
  stroski_usd: number;
  ustvarjeno: string;
  posodobljeno: string;
  napaka: string;
};

export type Hipoteza = { id: string; trditev: string; stanje: string; za: string; proti: string; kaj_bi_jo_ovrglo: string };
export type Konkurent = { ime: string; url: string; kaj_resi: string; cena: string; slabosti: string };
export type Resitev = {
  ime: string;
  vrsta: string;
  kupec: string;
  problem: string;
  danes: string;
  zakaj_boljse: string;
  kaj_dobi: string;
  cas_do_vrednosti: string;
  cena_hipoteza: string;
  strosek_izvedbe: string;
  zakaj_ostane: string;
  prvih_10: string;
  prvih_100: string;
  tveganja: string;
  stanje: string;
  zakaj_zavrnjena: string;
};

export type Sinteza = {
  povzetek_kroga?: string;
  hipoteze?: Hipoteza[];
  konkurenti?: Konkurent[];
  resitve?: Resitev[];
  ekonomika?: { postavka: string; vrednost: string; osnova: string }[];
  pot_do_kupcev?: {
    idealna_stranka: string;
    kanali: { kanal: string; zakonito: "da" | "ne" | "preveriti"; zakaj: string }[];
    prvi_stik: string;
    vprasanja_za_pogovor: string[];
    ugovori: string[];
    kdaj_opustimo: string;
  };
  validacija?: { test: string; kriterij_uspeha: string; strosek: string; trajanje: string };
  priporocilo?: {
    izid: Izid;
    zakaj: string;
    gotovost: string;
    dokazano: string[];
    predpostavke: string[];
    neznano: string[];
  };
  naslednji_korak?: string;
};

export type Ocena = {
  ocene?: Record<string, number>;
  povprecje?: number;
  nepodprto?: string[];
  pretiravanje?: string[];
  manjka?: string[];
  odlocitev?: string;
  naloga_za_naslednji_krog?: string;
  povzetek?: string;
};

export type Korak = {
  id: number;
  krog: number;
  vrsta: "iskanje" | "branje" | "krog" | "ocenjevalec" | string;
  vsebina: string;
  izid: string;
  podatki: Record<string, unknown>;
  cas: string;
};

export type Dokaz = {
  id: number;
  krog: number;
  url: string;
  domena: string;
  datum: string;
  odlomek: string;
  vrsta_vira: string;
  trditev: string;
  vrsta_dokaza: string;
  gotovost: string;
  hipoteza: string;
  smer: string;
  /** 1 = koda je odlomek našla na strani, 0 = ni ga našla, -1 = strani ni mogla prebrati. */
  preverjeno: number;
  /** 1 = URL so agentova orodja res videla. */
  videno: number;
};

export type StetjeSkd = {
  skd: string;
  naziv?: string;
  aktivnih?: number;
  druzb?: number;
  druzb_s_stranjo?: number;
  druzb_z_eposto?: number;
  ne_druzb?: number;
  napaka?: string;
};

export type Raziskava = {
  id: string;
  vprasanje: string;
  zakaj: string;
  stanje: StanjeRaziskave;
  faza: Faza;
  izid: Izid;
  krogov: number;
  najvec_krogov: number;
  najvec_minut: number;
  naloga: string;
  sinteza: Sinteza;
  ocena: Ocena;
  merila: { pogoj: string; izpolnjen: boolean }[];
  stetje: Record<string, StetjeSkd>;
  faze: { faza: Faza; opomba: string; cas: string }[];
  napaka: string;
  trajanje_s: number;
  stroski_usd: number;
  ustavi: number;
  krog_od: string;
  zaklep_do: string;
  ustvarjeno: string;
  zacetek: string;
  konec: string;
  posodobljeno: string;
  koraki: Korak[];
  dokazi: Dokaz[];
};

async function izHarveyja<T>(pot: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${HARVEY}${pot}`, { cache: "no-store", signal: AbortSignal.timeout(5_000), ...init });
  const telo = (await r.json().catch(() => ({}))) as T & { message?: string };
  if (!r.ok) throw new Error(telo?.message || `Harvey je vrnil ${r.status}`);
  return telo;
}

export function veljavenId(id: string): boolean {
  return ID.test(id);
}

export async function preberiRaziskave(): Promise<PovzetekRaziskave[] | null> {
  try {
    return (await izHarveyja<{ raziskave: PovzetekRaziskave[] }>("/api/priloznosti")).raziskave;
  } catch {
    return null;
  }
}

export async function preberiRaziskavo(id: string): Promise<Raziskava | null | "ni"> {
  if (!veljavenId(id)) return "ni";
  try {
    return await izHarveyja<Raziskava>(`/api/priloznosti/${id}`);
  } catch (e) {
    return e instanceof Error && e.message === "Raziskave ni." ? "ni" : null;
  }
}

async function poslji(pot: string, telo?: unknown): Promise<{ ok: boolean; napaka?: string; id?: string }> {
  try {
    const r = await izHarveyja<{ success: boolean; id?: string }>(pot, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo ?? {}),
    });
    return { ok: Boolean(r.success), id: r.id };
  } catch (e) {
    const sporocilo = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      napaka: sporocilo.includes("fetch failed") || sporocilo.includes("aborted")
        ? "Harvey ne odgovarja na 127.0.0.1:5555."
        : sporocilo,
    };
  }
}

export function novaRaziskava(vprasanje: string, zakaj: string, krogov: number) {
  return poslji("/api/priloznosti", { vprasanje, zakaj, krogov });
}

export function ustaviRaziskavo(id: string) {
  return poslji(`/api/priloznosti/${id}/ustavi`);
}

export function spremeniFazo(id: string, faza: Faza, opomba: string) {
  return poslji(`/api/priloznosti/${id}/faza`, { faza, opomba });
}
