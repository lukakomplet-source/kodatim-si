/**
 * Domains that should never be treated as "the company website" or scraped
 * for structured extraction — social platforms, plus third-party business
 * directories/registries that publish pages ABOUT a company (often ranking
 * highly for "<company name> uradna stran"-style searches) but aren't the
 * company's own domain.
 */
export const BLOCKED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "x.com",
  "twitter.com",
  "bizi.si",
  "companywall.si",
  "companywall.rs",
  "ajpes.si",
  "ebonitete.si",
  "kompass.com",
  "gvin.com",
  "ereg.si",
  "ipis.si",
  "fina.hr",
  "wikipedia.org",
  "stocktitan.net",
  // Slovenski poslovni imeniki: 22. 9. 2026 so na vzorcu dvanajstih iskanj
  // zasedli skoraj vsa prva mesta (pirs.si, itis.siol.net, zemljevid.najdi.si).
  // Dokaz lastnistva jih je pravilno zavrnil, a so pojedli mesta, kjer bi
  // lahko bila prava stran podjetja - in vsak tak kandidat stane zahtevo.
  "pirs.si",
  "najdi.si",
  "siol.net",
  "poslovniimenik.si",
  "telefonski-imenik.si",
  "zlatestrani.si",
  "bizim.si",
  "sloveniabusiness.eu",
  "europages.si",
  "europages.com",
  // 28. 9. 2026: imenika podjetij, ki izpišeta ime IN davčno podjetja, zato
  // sta prestala dokaz lastništva in dala napačno e-pošto (info@javnipodatki.si).
  "javnipodatki.si",
  "parcelnik.si",
];
