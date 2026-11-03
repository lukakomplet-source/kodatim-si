import "server-only";

/**
 * Vaja klica za panik gumb (3. 11. 2026): Harvey Kompletko (harvey/trening.py) igra izmišljenega prevoznika prek
 * Claude naročnine in vajo oceni po naših pravilih. Shrani se samo besedilo ocenjene vaje, nikoli zvok.
 */

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

export type Persona = { kljuc: string; ime: string; faza: "telefon" | "sestanek"; tezavnost: number; zacetek: string };
export type Izmenjava = { kdo: "t" | "s"; besedilo: string };
export type Tocka = { pravilo: string; ok: boolean | null; izsek: string };
export type Ocena = {
  ocena: number;
  izid: string;
  tocke: Tocka[];
  dobro: string;
  popravek: string;
  boljsi_stavek: string;
};
export type Vaja = {
  id: number;
  cas: string;
  kdo: string;
  persona: string;
  ime: string;
  ocena: number;
  izid: string;
  popravek: string;
};

async function harvey<T>(pot: string, telo?: unknown, cas = 6_000): Promise<{ ok: true; d: T } | { ok: false; napaka: string }> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}${pot}`, {
      method: telo === undefined ? "GET" : "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(cas),
      headers: telo === undefined ? undefined : { "Content-Type": "application/json" },
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
    const j = (await r.json().catch(() => ({}))) as T & { success?: boolean; message?: string };
    if (!r.ok || j.success === false) return { ok: false, napaka: j.message ?? `Harvey Kompletko je vrnil ${r.status}.` };
    return { ok: true, d: j };
  } catch {
    return { ok: false, napaka: "Harvey Kompletko ne odgovarja (5556)." };
  }
}

export async function preberiPersone(): Promise<Persona[] | null> {
  const r = await harvey<{ persone: Persona[] }>("/api/trening/persone");
  return r.ok ? r.d.persone : null;
}

export async function preberiVaje(kdo: string): Promise<{ vaje: Vaja[]; po_osebi: Record<string, { vaj: number; povprecje: number | null }> } | null> {
  const r = await harvey<{ vaje: Vaja[]; po_osebi: Record<string, { vaj: number; povprecje: number | null }> }>(
    `/api/trening/vaje?kdo=${encodeURIComponent(kdo)}`,
  );
  return r.ok ? { vaje: r.d.vaje, po_osebi: r.d.po_osebi } : null;
}

/** En odgovor vloge traja ~10 s (en klic Claude), ocena do pol minute. */
export async function odgovorVloge(persona: string, zgodovina: Izmenjava[]) {
  return harvey<{ odgovor: string; konec: boolean }>("/api/trening/odgovor", { persona, zgodovina }, 100_000);
}

export async function oceniVajo(persona: string, zgodovina: Izmenjava[], kdo: string) {
  return harvey<Ocena>("/api/trening/ocena", { persona, zgodovina, kdo }, 100_000);
}
