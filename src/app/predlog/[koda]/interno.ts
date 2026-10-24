/**
 * This browser belongs to the team (Luka, 24. 10. 2026: »daj da zazna če sm
 * bil js«). Set once the browser has opened the admin or a proposal with
 * ?interno; from then on its views of any proposal are never counted, even
 * from a link without ?interno.
 */
export const KLJUC_INTERNO = "kodatim-interno";

export function oznaciInterno(): void {
  try {
    localStorage.setItem(KLJUC_INTERNO, "1");
  } catch {
    // brez shrambe: ta brskalnik pač ne bo prepoznan
  }
}

export function jeInterno(): boolean {
  try {
    return localStorage.getItem(KLJUC_INTERNO) === "1";
  } catch {
    return false;
  }
}
