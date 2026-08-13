"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";

/**
 * A person editing their own account.
 *
 * Email and password go through the user's OWN session client, never the
 * service-role one. That matters: Supabase then applies its own rules —
 * confirming a new address by mail before it takes effect, enforcing password
 * length — and the change is unambiguously made by the account holder rather
 * than by our backend on their behalf. We never see or store a password.
 */

export type NastavitveResult = { error?: string; success?: string };

export async function spremeniEmail(
  _prev: NastavitveResult,
  formData: FormData
): Promise<NastavitveResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return { error: "Niste prijavljeni." };

  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-naslov ni videti veljaven." };
  if (email === dostop.email) return { error: "To je vaš trenutni e-naslov." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { error: `Spremembe ni bilo mogoče shraniti: ${error.message}` };

  return {
    success:
      "Na novi e-naslov smo poslali potrditveno povezavo. Sprememba začne veljati, ko jo potrdite.",
  };
}

export async function spremeniGeslo(
  _prev: NastavitveResult,
  formData: FormData
): Promise<NastavitveResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return { error: "Niste prijavljeni." };

  const geslo = String(formData.get("geslo") ?? "");
  const ponovi = String(formData.get("ponovi") ?? "");

  if (geslo.length < 8) return { error: "Geslo naj ima vsaj 8 znakov." };
  if (geslo !== ponovi) return { error: "Gesli se ne ujemata." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: geslo });
  if (error) return { error: `Gesla ni bilo mogoče spremeniti: ${error.message}` };

  return { success: "Geslo je spremenjeno." };
}

/**
 * Where notifications go — separate from the login address on purpose: someone
 * may sign in with a personal address and want the alerts in a work inbox.
 */
export async function spremeniObvestila(
  _prev: NastavitveResult,
  formData: FormData
): Promise<NastavitveResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) return { error: "Niste prijavljeni." };

  const email = String(formData.get("obvestila_email") ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "E-naslov ni videti veljaven." };
  }

  const db = createAvtonetClient();
  const { error } = await db
    .from("avtonet_uporabniki")
    .upsert(
      { uporabnik: dostop.userId, obvestila_email: email || null },
      { onConflict: "uporabnik" }
    );

  if (error) {
    if (error.code === "PGRST205") {
      return { error: "Poženite supabase/migration_avtonet_uporabniki.sql." };
    }
    return { error: `Shranjevanje ni uspelo: ${error.message}` };
  }

  revalidatePath("/avtonet/nastavitve");
  return { success: email ? `Obvestila bodo prihajala na ${email}.` : "Obvestila so izklopljena." };
}
