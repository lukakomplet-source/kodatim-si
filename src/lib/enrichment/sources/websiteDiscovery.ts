import { searchWeb } from "@/lib/firecrawl";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type EnrichmentSource, type SourceRunResult } from "../types";
import { BLOCKED_DOMAINS } from "../blockedDomains";

export const websiteDiscoverySource: EnrichmentSource = {
  id: "website_discovery",
  stage: "searching",
  label: "Iskanje spletne strani",

  shouldRun(lead: IntelLead) {
    return !lead.website;
  },

  async run(lead: IntelLead): Promise<SourceRunResult> {
    const query = [lead.company_name, lead.address_city, "uradna stran"]
      .filter(Boolean)
      .join(" ");
    const results = await searchWeb(query, { limit: 5, country: "SI" });

    const candidate = results.find(
      (r) => !BLOCKED_DOMAINS.some((d) => r.url.toLowerCase().includes(d))
    );

    if (!candidate) {
      return { note: "Iskanje strani: ni bilo mogoče najti spletne strani podjetja." };
    }

    return {
      fields: {
        website: { value: candidate.url, confidence: CONFIDENCE.WEBSITE_DISCOVERY },
      },
      note: `Iskanje strani: najdena stran ${candidate.url}.`,
    };
  },
};
