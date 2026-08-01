import { searchWeb } from "@/lib/firecrawl";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import type { DiscoveredUrls, DiscoverySnippet } from "./types";

function isMapsUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("google.com/maps") || u.includes("g.page") || u.includes("maps.app.goo.gl");
}

/**
 * Runs a broad set of name-variant searches to discover candidate URLs for
 * every downstream provider in one pass, so CompanyWall/Bizi/Maps/LinkedIn/
 * Facebook/Instagram don't each need their own broad search. Never throws —
 * a total failure just yields an empty result and every provider falls back
 * to its own targeted search.
 */
export async function discoverUrls(lead: IntelLead): Promise<DiscoveredUrls> {
  const name = lead.company_name;
  const queries = [
    name,
    `${name} d.o.o.`,
    `${name} Slovenija`,
    `${name} CompanyWall`,
    `${name} Bizi`,
    `${name} AJPES`,
    `${name} LinkedIn`,
    `${name} Facebook`,
    `${name} Instagram`,
    `${name} "Google Maps"`,
  ];

  const results = await Promise.allSettled(queries.map((q) => searchWeb(q, { limit: 5, country: "SI" })));

  const snippets: DiscoverySnippet[] = [];
  const discovered: DiscoveredUrls = { snippets };

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const r of result.value) {
      const url = r.url;
      if (!url) continue;
      snippets.push({ url, title: r.title, description: r.description });

      const lower = url.toLowerCase();
      if (!discovered.companywall && lower.includes("companywall.si")) discovered.companywall = url;
      else if (!discovered.bizi && lower.includes("bizi.si")) discovered.bizi = url;
      else if (!discovered.ajpes && lower.includes("ajpes.si")) discovered.ajpes = url;
      else if (!discovered.linkedin && lower.includes("linkedin.com")) discovered.linkedin = url;
      else if (!discovered.facebook && lower.includes("facebook.com")) discovered.facebook = url;
      else if (!discovered.instagram && lower.includes("instagram.com")) discovered.instagram = url;
      else if (!discovered.googleMaps && isMapsUrl(url)) discovered.googleMaps = url;
    }
  }

  return discovered;
}
