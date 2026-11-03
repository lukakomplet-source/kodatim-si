import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";

/**
 * Stikalo Vse / KodaTim / Kompletko na vrhu menija (faza 3). Izbira je shranjena za vsakega uporabnika v
 * ui_state (ključ KLJUC_POSLA), zato velja na telefonu in na računalniku. Strani po njej še ne filtrirajo;
 * kasnejše faze (Danes, Podjetja, Komunikacija, Številke) jo preberejo s preberiPosel().
 */

export type Posel = "vse" | "kodatim" | "kompletko";

export const KLJUC_POSLA = "posel";

export function jePosel(v: unknown): v is Posel {
  return v === "vse" || v === "kodatim" || v === "kompletko";
}

/** Izbira prijavljenega uporabnika. Privzeto: Prodaja Kompletko → »kompletko«, vsi ostali → »vse«. */
export const preberiPosel = cache(async (): Promise<Posel> => {
  const perms = await getCurrentUserPermissions();
  if (!perms || perms.neaktiven) return "vse";
  const privzeto: Posel = perms.roleKey === "prodaja_kompletko" ? "kompletko" : "vse";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ui_state")
    .select("value")
    .eq("user_id", perms.userId)
    .eq("key", KLJUC_POSLA)
    .maybeSingle();

  // Missing table (migration not run) or nothing saved yet: the default.
  if (error || !data) return privzeto;
  const izbira = (data.value as { izbira?: unknown } | null)?.izbira;
  return jePosel(izbira) ? izbira : privzeto;
});
