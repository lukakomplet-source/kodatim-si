import type { VirAdapter } from "./vmesnik.js";
import { adapter as nepremicnineNet } from "./nepremicnine-net.js";
import { adapter as bolha } from "./bolha.js";
import { adapter as siol } from "./siol.js";
import { adapter as salomon } from "./salomon.js";

/**
 * Register virov. Vrstni red = vrstni red dnevne obdelave (zaporedno, nikoli
 * hkrati — do virov smo vljudni, do lastnega procesa pa predvidljivi).
 * Ali je vir dejansko VKLOPLJEN, odloča nep_viri.omogocen v bazi; novi viri
 * se vpišejo IZKLOPLJENI in jih vklopi človek v konzoli, kjer je ob gumbu
 * izpisano tudi, kaj o zajemu pravijo pogoji uporabe tistega vira.
 *
 * Namenoma NI v registru:
 *  - mojikvadrati.com — programskim odjemalcem vrača 403 (Cloudflare). To je
 *    dejaven tehničen ukrep; zaobiti ga z brskalnikom bi bilo natanko tisto,
 *    česar ne počnemo. Poleg tega njihovi pogoji bote izrecno prepovedujejo.
 *  - nepremicnine.si21.com — pogoji imajo poglavje "Prepoved 'scrapinga'", ki
 *    dobesedno prepoveduje "gradnjo lastnih baz podatkov iz podatkov
 *    Platforme", stran pa je za Cloudflare bot-zaščito.
 * Pri obeh je edina čista pot dogovor z upravljavcem, ne boljši scraper.
 */
export const VIRI: VirAdapter[] = [nepremicnineNet, bolha, siol, salomon];

/** Adapter po imenu; null/neznano ime -> prvi (zapuščinski pregledi brez vira). */
export function najdiVir(vir: string | null): VirAdapter {
  return VIRI.find((v) => v.vir === vir) ?? VIRI[0];
}
