"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAli } from "@/lib/require-admin";
import { dodajVKampanjo, kampanjaVPripravi } from "@/lib/kompletko-kampanje";

/** Ročni dodatek podjetja v kampanjo v pripravi. Nič se ne pošlje. */
export async function dodajPodjetjeAkcija(
  kampanja: string,
  podatki: { ime: string; davcna: string; spletna: string; opomba: string },
): Promise<{ ok: boolean; napaka?: string }> {
  let kdo = "";
  try {
    kdo = (await requireAdminAli("kompletko.view")).email ?? "";
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!kampanjaVPripravi(kampanja)) return { ok: false, napaka: "Ta kampanja ne obstaja." };
  if (podatki.ime.trim().length < 3) return { ok: false, napaka: "Vpiši ime podjetja." };
  const r = await dodajVKampanjo(kampanja, {
    ime: podatki.ime.trim().slice(0, 200),
    davcna: podatki.davcna.trim().slice(0, 20),
    spletna: podatki.spletna.trim().slice(0, 200),
    opomba: podatki.opomba.trim().slice(0, 500),
    kdo,
  });
  if (r.ok) revalidatePath(`/admin/kompletko-kampanje/${kampanja}`);
  return r;
}
