import "server-only";
import { zahtevajStran } from "@/lib/require-admin";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import { preberiPosel, type Posel } from "@/lib/posel";

/**
 * Kdo gleda Podjetja (faza 6): zapora vseh strani je lead_intelligence.view ali kompletko.view (ista kot v
 * admin-meni.ts). KodaTim del vidi, kdor sme leade; Kompletko del, kdor sme Kompletko. Administrator izbira s
 * stikalom, Prodaja Kompletko vidi samo Kompletko.
 */
export async function kontekstPodjetij(prepisPosla?: string): Promise<{
  jeAdmin: boolean;
  posel: Posel;
  kodatim: boolean;
  kompletko: boolean;
  /** Kar uporabnik sme ne glede na stikalo (kartica, Dodaj, Ctrl+K: istega podjetja ne kontaktiramo dvakrat). */
  smeKodatim: boolean;
  smeKompletko: boolean;
}> {
  await zahtevajStran("lead_intelligence.view", "kompletko.view");
  const [perms, izbira] = await Promise.all([getCurrentUserPermissions(), preberiPosel()]);
  const aktiven = !!perms && !perms.neaktiven;
  const jeAdmin = aktiven && perms.bypassAll;
  const smeLeade = jeAdmin || (aktiven && perms.granted.has("lead_intelligence.view"));
  const smeKompletko = jeAdmin || (aktiven && perms.granted.has("kompletko.view"));
  const prepis = prepisPosla === "kodatim" || prepisPosla === "kompletko" ? prepisPosla : null;
  const posel: Posel = prepis ?? izbira;
  // A user with only one business sees that one, whatever the switch says.
  const kodatim = smeLeade && (posel !== "kompletko" || !smeKompletko);
  const kompletko = smeKompletko && (posel !== "kodatim" || !smeLeade);
  return { jeAdmin, posel, kodatim, kompletko, smeKodatim: smeLeade, smeKompletko };
}
