import "server-only";
import { zahtevajStran } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { preberiPosel, type Posel } from "@/lib/posel";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Kdo gleda Danes in kateri posel: zapora strani je ista kot zavihek v admin-meni.ts (dashboard.view). Administrator
 * izbira posel s stikalom. Kdor ni administrator, vidi samo Kompletko in to samo s pravico kompletko.view (Prodaja
 * Kompletko); izid klica lahko vpiše samo s kompletko.calls (ista pravica kot v akcijah). Drugi (npr. manager, sales)
 * vidijo prazen Danes brez podatkov Kompletka.
 */
export async function kontekstDanes(): Promise<{
  jeAdmin: boolean;
  posel: Posel;
  kodatim: boolean;
  kompletko: boolean;
  /** Sme vpisati izid klica Kompletko, preveriti kontakt in vpisati klic zunaj seznama. */
  klici: boolean;
  email: string;
  /** Ime klicatelja iz profila (profiles.full_name); prazno, ko ga ni. Nikoli e-naslov. */
  ime: string;
}> {
  const user = await zahtevajStran("dashboard.view");
  const [perms, izbira, profil] = await Promise.all([
    getCurrentUserPermissions(),
    preberiPosel(),
    createAdminClient().from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const jeAdmin = !!perms && !perms.neaktiven && perms.bypassAll;
  const aktiven = !!perms && !perms.neaktiven;
  const posel: Posel = jeAdmin ? izbira : "kompletko";
  const kompletko = jeAdmin ? posel !== "kodatim" : aktiven && perms.granted.has("kompletko.view");
  const klici = jeAdmin || (aktiven && kompletko && perms.granted.has("kompletko.calls"));
  const ime = ((profil.data?.full_name as string | null) ?? "").trim();
  return { jeAdmin, posel, kodatim: jeAdmin && posel !== "kompletko", kompletko, klici, email: user.email ?? "", ime };
}
