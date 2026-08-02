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
];
