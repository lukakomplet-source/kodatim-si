import "server-only";
import { zahtevajStran } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { preberiPosel, type Posel } from "@/lib/posel";

/**
 * Kdo gleda Komunikacijo (faza 5): zapora vseh treh zavihkov je kompletko.view (ista kot v admin-meni.ts).
 * Administrator izbira posel s stikalom (ali ?posel= za en pogled) in edini pošilja. Prodaja Kompletko vidi samo Kompletko (osnutke, poslano,
 * odgovore), pošiljati ne sme.
 */
export async function kontekstKomunikacije(prepisPosla?: string): Promise<{
  jeAdmin: boolean;
  posel: Posel;
  kodatim: boolean;
  kompletko: boolean;
  /** Sme odpreti kartico leada (sicer povezava na domeno). */
  smeLeade: boolean;
  email: string;
}> {
  const user = await zahtevajStran("kompletko.view");
  const [perms, izbira] = await Promise.all([getCurrentUserPermissions(), preberiPosel()]);
  const jeAdmin = !!perms && !perms.neaktiven && perms.bypassAll;
  // ?posel=kodatim|kompletko (Telegram, stari naslovi): administrator vidi ta posel ne glede na stikalo.
  const prepis = prepisPosla === "kodatim" || prepisPosla === "kompletko" ? prepisPosla : null;
  const posel: Posel = jeAdmin ? (prepis ?? izbira) : "kompletko";
  const smeLeade = jeAdmin || (!!perms && !perms.neaktiven && perms.granted.has("lead_intelligence.view"));
  return {
    jeAdmin,
    posel,
    kodatim: jeAdmin && posel !== "kompletko",
    kompletko: posel !== "kodatim",
    smeLeade,
    email: user.email ?? "",
  };
}
