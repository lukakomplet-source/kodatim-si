"use server";

import { requireAdminAli } from "@/lib/require-admin";
import { odgovorVloge, oceniVajo, type Izmenjava, type Ocena } from "@/lib/trening";

function ocisti(zgodovina: Izmenjava[]): Izmenjava[] {
  return (Array.isArray(zgodovina) ? zgodovina : [])
    .filter((z) => (z?.kdo === "t" || z?.kdo === "s") && typeof z.besedilo === "string")
    .slice(-80)
    .map((z) => ({ kdo: z.kdo, besedilo: z.besedilo.slice(0, 600) }));
}

export async function odgovorAkcija(
  persona: string,
  zgodovina: Izmenjava[],
): Promise<{ ok: boolean; odgovor?: string; konec?: boolean; napaka?: string }> {
  try {
    await requireAdminAli("kompletko.view");
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  const r = await odgovorVloge(String(persona).slice(0, 40), ocisti(zgodovina));
  return r.ok ? { ok: true, odgovor: r.d.odgovor, konec: r.d.konec } : { ok: false, napaka: r.napaka };
}

export async function ocenaAkcija(
  persona: string,
  zgodovina: Izmenjava[],
): Promise<{ ok: boolean; ocena?: Ocena; napaka?: string }> {
  let kdo = "";
  try {
    kdo = (await requireAdminAli("kompletko.view")).email ?? "";
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  const r = await oceniVajo(String(persona).slice(0, 40), ocisti(zgodovina), kdo);
  return r.ok ? { ok: true, ocena: r.d } : { ok: false, napaka: r.napaka };
}
