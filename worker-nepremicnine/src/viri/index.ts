import type { VirAdapter } from "./vmesnik.js";
import { adapter as nepremicnineNet } from "./nepremicnine-net.js";
import { adapter as bolha } from "./bolha.js";

/**
 * Register virov. Vrstni red = vrstni red dnevne obdelave (zaporedno, nikoli
 * hkrati — do virov smo vljudni, do lastnega procesa pa predvidljivi).
 * Ali je vir dejansko VKLOPLJEN, odloča nep_viri.omogocen v bazi.
 */
export const VIRI: VirAdapter[] = [nepremicnineNet, bolha];

/** Adapter po imenu; null/neznano ime -> prvi (zapuščinski pregledi brez vira). */
export function najdiVir(vir: string | null): VirAdapter {
  return VIRI.find((v) => v.vir === vir) ?? VIRI[0];
}
