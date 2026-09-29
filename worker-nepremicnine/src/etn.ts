/**
 * Pomožne funkcije za GURS ETN (uvoz-etn.ts) — ločene, da jih je mogoče
 * preizkusiti brez zagona uvoza.
 */

/**
 * Tržen posel: GURS od leta 2015 označi, ali posel izpolnjuje pogoje za tržno
 * ceno. Opis šifre je besedilo, zato beremo pomen, ne številke: nikalnica
 * ("ni", "ne", "netržen") pomeni NE. Pri starejših poslih oznake ni — takrat
 * posla ne izločimo, ker bi sicer izgubili vsa leta pred 2015.
 */
export function jeTrzen(opis: string | null): boolean {
  if (!opis) return true;
  const t = opis.toLowerCase();
  if (/\bni\b|\bne\b|netrž|ne izpoln/.test(t)) return false;
  return /trž|izpoln/.test(t);
}

/** Vrsta dela stavbe iz šifranta v naš par kategorij za mediane. */
export function vrstaZaMediano(opis: string | null): "stanovanje" | "hisa" | null {
  if (!opis) return null;
  const t = opis.toLowerCase();
  if (/^stanovanje\b|stanovanje v /.test(t) && !/hiš/.test(t)) return "stanovanje";
  if (/stanovanjsk\w* hiš|^hiša|enostanovanjsk|dvostanovanjsk|vrstn\w* hiš|dvojček/.test(t)) return "hisa";
  return null;
}

export function kvantil(urejeno: number[], q: number): number {
  const i = (urejeno.length - 1) * q;
  const s = Math.floor(i);
  return s + 1 < urejeno.length ? urejeno[s] + (urejeno[s + 1] - urejeno[s]) * (i - s) : urejeno[s];
}

/**
 * Vrsta posla, ki ni prosti trg: dražba, izvršba, stečaj, lizing, razlastitev,
 * posel med povezanimi osebami. GURS jih lahko označi kot "tržne" (pogoji za
 * tržno ceno so izpolnjeni), a v primerjalno ceno ne sodijo — prav njihova
 * razlika do trga je tisto, kar merimo posebej. Sintetični preizkus je to
 * pokazal: deset dražb je mediano naselja znižalo z ~3.790 na 3.375 €/m².
 */
export function niProstiTrg(vrstaPosla: string | null): boolean {
  return vrstaPosla !== null && /dražb|drazb|izvrš|izvrs|stečaj|stecaj|lizing|razlast|povezan|sodn/i.test(vrstaPosla);
}
