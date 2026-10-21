"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { novaRaziskava, predlagajTeme, spremeniFazo, ustaviRaziskavo, veljavenId } from "@/lib/priloznosti";
import { FAZE, FAZE_S_SIGNALOM, type Faza } from "@/lib/priloznostiFaze";

type Rezultat = { ok: boolean; napaka?: string; id?: string };

async function admin(): Promise<string | null> {
  try {
    await requireAdmin();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Napaka.";
  }
}

/** Novo raziskovalno vprašanje; Harvey ga raziskuje v krogih v ozadju. */
export async function novaRaziskavaAkcija(vprasanje: string, zakaj: string, krogov: number): Promise<Rezultat> {
  const napaka = await admin();
  if (napaka) return { ok: false, napaka };
  const v = vprasanje.trim();
  if (v.length < 15 || v.length > 1000) return { ok: false, napaka: "Vprašanje naj ima od 15 do 1000 znakov." };
  if (zakaj.length > 1000) return { ok: false, napaka: "Razlog je predolg." };
  if (!Number.isInteger(krogov) || krogov < 1 || krogov > 10) return { ok: false, napaka: "Krogov je lahko od 1 do 10." };
  const r = await novaRaziskava(v, zakaj.trim(), krogov);
  revalidatePath("/admin/priloznosti");
  return r.ok ? { ok: true, id: r.id } : { ok: false, napaka: r.napaka ?? "Harvey raziskave ni sprejel." };
}

/** Ustavi po koncu trenutnega kroga (krog, ki teče, se dokonča in shrani). */
export async function ustaviAkcija(id: string): Promise<Rezultat> {
  const napaka = await admin();
  if (napaka) return { ok: false, napaka };
  if (!veljavenId(id)) return { ok: false, napaka: "Neznana raziskava." };
  const r = await ustaviRaziskavo(id);
  revalidatePath(`/admin/priloznosti/${id}`);
  return r.ok ? { ok: true } : { ok: false, napaka: r.napaka ?? "Ustavitev ni uspela." };
}

/** Premik priložnosti v drugo fazo; od validacije naprej samo z zapisanim resničnim signalom. */
export async function fazaAkcija(id: string, faza: Faza, opomba: string): Promise<Rezultat> {
  const napaka = await admin();
  if (napaka) return { ok: false, napaka };
  if (!veljavenId(id) || !(FAZE as readonly string[]).includes(faza)) return { ok: false, napaka: "Neznana faza." };
  if (opomba.length > 1500) return { ok: false, napaka: "Opomba je predolga." };
  if (FAZE_S_SIGNALOM.includes(faza) && !opomba.trim()) {
    return { ok: false, napaka: "Zapiši resničen signal: pogovor, pilot ali naročilo." };
  }
  const r = await spremeniFazo(id, faza, opomba.trim());
  revalidatePath(`/admin/priloznosti/${id}`);
  revalidatePath("/admin/priloznosti");
  return r.ok ? { ok: true } : { ok: false, napaka: r.napaka ?? "Sprememba ni uspela." };
}

/** Agent sam predlaga 3–5 tem iz registra in preteklih raziskav; Harvey to naredi v ozadju (nekaj minut). */
export async function predlagajTemeAkcija(): Promise<Rezultat> {
  const napaka = await admin();
  if (napaka) return { ok: false, napaka };
  const r = await predlagajTeme();
  revalidatePath("/admin/priloznosti");
  return r.ok ? { ok: true } : { ok: false, napaka: r.napaka ?? "Harvey zahteve ni sprejel." };
}
