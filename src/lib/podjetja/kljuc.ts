/**
 * Ključ podjetja (faza 6, 3. 11. 2026): davčna (samo števke, zadnjih 8), potrjena z matično; domena je drugi
 * ključ; e-pošta je samo podatek kontakta. Podjetje brez davčne in domene ima začasni ključ (»rocno:…« ali e-naslov).
 * Pregled: Documents\KOMPLETKO-PRODAJA\Faza 1 - pregled admina kodatim.md, razdelek 3.
 */

/** »SI 12345678«, »12345678«, »SI12345678« → »12345678«; vse, kar nima 8 števk, je "". */
export function davcnaIz(v: unknown): string {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length >= 8 ? s.slice(-8) : "";
}

/** Matična brez presledkov; primerjamo prvih 7 števk (zadnje 3 so pogosto »000«). */
export function maticnaIz(v: unknown): string {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length >= 7 ? s : "";
}

export function maticniSeUjemata(a: string, b: string): boolean {
  return !a || !b || a.slice(0, 7) === b.slice(0, 7);
}

const BREZPLACNE = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "aol.com", "gmx.com", "gmx.net", "gmx.de", "web.de", "proton.me", "protonmail.com",
  "siol.net", "t-2.net", "amis.net", "telemach.net", "volja.net", "email.si", "guest.arnes.si", "triera.net",
  "hotmail.si", "yahoo.si", "net.hr", "gmail.si", "siol.com",
]);

/** Brezplačni ponudniki pošte (gmail.com, siol.net …) niso domena podjetja. */
export function jeBrezplacna(domena: string): boolean {
  return BREZPLACNE.has((domena ?? "").trim().toLowerCase());
}

const DOMENA = /^[a-z0-9][a-z0-9.-]{0,80}\.[a-z]{2,}$/;

/** Domene, ki niso podjetje: naše, platforme, imeniki. */
const NI_PODJETJE = [
  "kodatim.si", "kompletko.com", "protectrans.com", "protectrans.si",
  "facebook.com", "instagram.com", "linkedin.com", "youtube.com", "tiktok.com", "x.com", "twitter.com",
  "google.com", "sites.google.com", "business.site", "wixsite.com", "wix.com", "weebly.com", "wordpress.com",
  "blogspot.com", "bizi.si", "companywall.si", "ajpes.si", "telefonski-imenik.si", "itis.si", "najdi.si",
  "booking.com", "airbnb.com", "tripadvisor.com",
];

/** Domena iz spletne strani ali naslova (brez www.); "" za neveljavno, brezplačno pošto ali platformo. */
export function domenaIz(v: unknown): string {
  let s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("@") && !s.includes("/")) s = s.split("@")[1] ?? "";
  try {
    s = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return "";
  }
  s = s.replace(/^www\./, "");
  if (!DOMENA.test(s) || jeBrezplacna(s)) return "";
  if (NI_PODJETJE.some((d) => s === d || s.endsWith(`.${d}`))) return "";
  return s;
}

/** Ključ v naslovu kartice: /admin/podjetja/<ključ>. */
export function hrefPodjetja(kljuc: string): string {
  return `/admin/podjetja/${encodeURIComponent(kljuc)}`;
}

/** Ime za primerjavo: brez pravne oblike, ločil in šumnikov. */
export function imeZaIskanje(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Telefon za primerjavo: zadnjih 8 števk (kot Preveri pri klicih). */
export function telefonIz(v: unknown): string {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length >= 6 ? s.slice(-8) : "";
}
