import { isFirecrawlUnavailable } from "@/lib/firecrawl";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { providerFetch } from "./httpClient";
import { ajpesProvider } from "./providers/ajpes";
import { companyWallProvider } from "./providers/companywall";
import { biziProvider } from "./providers/bizi";
import { websiteProvider } from "./providers/website";
import { identityConflict, mergeIdentity, type CompanyIdentity } from "./identity";
import {
  PUBLIC_ENRICHMENT_SOURCE_LABELS,
  type PublicEnrichmentProvider,
  type PublicEnrichmentSourceId,
} from "./types";

/**
 * The engine behind "AI dopolni vse" on the import screen.
 *
 * This used to run entirely on Firecrawl web search, so once the Firecrawl
 * account ran out of credits the button filled nothing and could only show a
 * warning — while AJPES/CompanyWall/Bizi returned 7/10/10 fields for the very
 * same company, for free. It now uses those registries in the same priority
 * order as the enrichment pipeline (AJPES -> CompanyWall -> Bizi -> website),
 * with Firecrawl demoted to an optional extra it never depends on.
 *
 * Also returns, per empty field, WHY it is empty — so the form can say
 * "AJPES: AMBIGUOUS MATCH …" instead of a generic failure.
 *
 * Lives here rather than in the route handler so `scripts/verify-ai-complete.ts`
 * can exercise the exact code path the button uses, with no auth and no
 * duplicated chain logic that could drift out of sync.
 */

/** Fields the import form actually has inputs for. */
const FORM_FIELDS = [
  "industry",
  "email",
  "phone",
  "address_street",
  "address_city",
  "address_region",
  "address_country",
  "vat_id",
] as const;

/**
 * Extra values worth returning even though the form has no dedicated input.
 * The form carries them through as JSON in a hidden field and createLead
 * whitelists them into custom_fields, so nothing the registries publish is
 * thrown away just because there is no visible input for it.
 */
const EXTRA_FIELDS = [
  "skd_code", "skd_name", "skis_code", "skis_name", "registration_number", "director",
  "owners", "founded_date", "legal_form", "company_status", "company_size",
  "employees_count", "revenue_amount", "revenue_year", "profit", "ebitda",
  "credit_rating", "official_name", "official_long_name", "bank_account", "postal_code",
] as const;

export const QUICK_COMPLETE_FIELDS: readonly string[] = [...FORM_FIELDS, ...EXTRA_FIELDS];

/**
 * Mailbox providers — an address here says nothing about the company's own
 * domain, so it must never be turned into a website guess.
 */
const FREE_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "protonmail.com", "proton.me", "siol.net", "t-2.net", "telemach.net",
  "amis.net", "volja.net", "triera.net", "email.si", "gmail.si", "telemach.si",
];

/** A company email on its own domain is a reliable website hint (info@podjetje.si -> podjetje.si). */
function websiteFromEmail(email: string | undefined): string | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain || !domain.includes(".")) return null;
  if (FREE_MAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return null;
  return `https://${domain}`;
}

/**
 * A short "what does this company actually do" line for the notes field, so
 * the list can be skimmed without opening each lead.
 */
function composeDescription(
  fields: Record<string, string>,
  registryDescription?: string | null
): string | null {
  // Plain-language activity first ("Arhiviranje"), then the official SKD
  // classification, then the full registered name — which in Slovenia spells
  // the activities out ("ARHIV PNM, podjetje za arhiviranje, trgovino in druge
  // storitve, d.o.o.") and is the most informative line of the three. Bizi is
  // the only source that publishes that long form.
  const parts: string[] = [];
  const activity = fields.industry || fields.skd_name;
  if (activity) parts.push(activity);
  if (fields.skd_name && fields.skd_name !== activity) {
    parts.push(`SKD ${fields.skd_code ?? ""} ${fields.skd_name}`.trim());
  }

  const longName = fields.official_long_name || fields.official_name;
  if (longName && !parts.some((p) => p === longName)) parts.push(longName);

  // Size and status make a lead triageable at a glance — a company in
  // receivership or with no revenue is not worth a sales call.
  const facts: string[] = [];
  // Only a real headcount reads as "N zaposlenih"; a size class is printed as-is.
  if (fields.employees_count && /^\d/.test(fields.employees_count)) {
    facts.push(`${fields.employees_count} zaposlenih`);
  } else if (fields.company_size && /mikro|majhn|srednj|velik/i.test(fields.company_size)) {
    facts.push(fields.company_size.toLowerCase());
  }
  if (fields.revenue_amount) {
    facts.push(`prihodki ${fields.revenue_amount} €${fields.revenue_year ? ` (${fields.revenue_year})` : ""}`);
  }
  if (fields.company_status && fields.company_status.toLowerCase() !== "aktivna") {
    facts.push(fields.company_status);
  }
  if (facts.length > 0) parts.push(facts.join(", "));

  if (parts.length === 0) return registryDescription ?? null;
  return parts.join(" · ");
}

export type QuickCompleteResult = {
  website: string | null;
  fields: Record<string, string>;
  sources: Record<string, string>;
  fieldNotes: Record<string, string>;
  providerNotes: { label: string; note: string }[];
  description: string | null;
  source: string;
  /** Set only when nothing at all could be found — the UI shows it in amber, never red. */
  warning?: string;
};

export async function quickComplete(companyName: string, city?: string): Promise<QuickCompleteResult> {
  const fields: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const fieldNotes: Record<string, string> = {};
  const providerNotes: { label: string; note: string }[] = [];
  let website: string | null = null;
  let description: string | null = null;

  // Mutable working lead so each provider sees what the previous one resolved
  // (CompanyWall's official name is what lets Bizi build the right URL).
  const working: Record<string, unknown> = {
    company_name: companyName,
    address_city: city || null,
    custom_fields: {} as Record<string, string>,
  };

  const chain: PublicEnrichmentProvider[] = [ajpesProvider, companyWallProvider, biziProvider];

  // Company names repeat in Slovenia, so a later source is only trusted once
  // its davčna/matična agrees with the one an earlier registry established.
  let identity: CompanyIdentity = { vat_id: null, registration_number: null };

  for (const provider of chain) {
    try {
      const result = await provider.run(working as unknown as IntelLead);
      const claimed: CompanyIdentity = {
        vat_id: result.fields?.vat_id?.value ?? null,
        registration_number: result.fields?.registration_number?.value ?? null,
      };

      const conflict = identityConflict(identity, claimed);
      if (conflict) {
        providerNotes.push({ label: provider.label, note: `podatki zavrnjeni — ${conflict}` });
        continue;
      }
      identity = mergeIdentity(identity, claimed);

      providerNotes.push({ label: provider.label, note: result.note });

      for (const [key, candidate] of Object.entries(result.fields ?? {})) {
        if (!candidate?.value) continue;
        if (key === "website" && !website) website = candidate.value;
        if (key === "description" && !description) description = candidate.value;

        // Feed identity forward for the next provider in the chain.
        (working.custom_fields as Record<string, string>)[key] = candidate.value;
        if (key === "address_city" && !working.address_city) working.address_city = candidate.value;

        if (!QUICK_COMPLETE_FIELDS.includes(key)) continue;
        if (fields[key]) continue; // first (highest-priority) source wins
        fields[key] = candidate.value;
        sources[key] = PUBLIC_ENRICHMENT_SOURCE_LABELS[provider.id as PublicEnrichmentSourceId] ?? provider.id;
      }

      // Keep the FIRST provider's reason — the chain runs in authority order,
      // so AJPES's "AMBIGUOUS MATCH" is the root cause worth showing, not
      // Bizi's downstream 404 that merely follows from it.
      for (const [key, reason] of Object.entries(result.diagnostics?.fieldReasons ?? {})) {
        if (QUICK_COMPLETE_FIELDS.includes(key) && !fields[key] && !fieldNotes[key]) {
          fieldNotes[key] = `${provider.label}: ${reason}`;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      providerNotes.push({ label: provider.label, note: `napaka — ${message}` });
    }
  }

  // No registry listed a site? A company email on its own domain is a solid
  // hint (info@podjetje.si -> podjetje.si). Free mailbox domains are excluded,
  // and the address is only kept if it actually responds — never a blind guess.
  if (!website) {
    const guess = websiteFromEmail(fields.email);
    if (guess) {
      try {
        const res = await providerFetch("website", guess, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" },
          maxAttempts: 1,
        });
        if (res.ok) {
          website = guess;
          providerNotes.push({
            label: "Spletna stran",
            note: `ugotovljena iz e-poštne domene (${guess}) in preverjena — HTTP ${res.status}.`,
          });
        }
      } catch {
        providerNotes.push({
          label: "Spletna stran",
          note: `domena iz e-pošte (${guess}) se ni odzvala — ni uporabljena.`,
        });
      }
    }
  }

  // Optional final pass: if a website turned up, read it for anything still
  // missing. Plain fetch() first, Firecrawl only for JS-only pages — so a
  // missing Firecrawl balance costs nothing here.
  if (website) {
    try {
      const result = await websiteProvider.run({ ...working, website } as unknown as IntelLead);
      providerNotes.push({ label: websiteProvider.label, note: result.note });
      for (const [key, candidate] of Object.entries(result.fields ?? {})) {
        if (!candidate?.value || !QUICK_COMPLETE_FIELDS.includes(key) || fields[key]) continue;
        fields[key] = candidate.value;
        sources[key] = "Spletna stran";
      }
    } catch (err) {
      if (!isFirecrawlUnavailable(err)) {
        const message = err instanceof Error ? err.message : "neznana napaka";
        providerNotes.push({ label: websiteProvider.label, note: `napaka — ${message}` });
      }
    }
  }

  // A registry that publishes the activity name has effectively published the
  // industry too — the only difference is the label, so don't leave the field
  // empty next to a filled skd_name.
  if (!fields.industry && fields.skd_name) {
    fields.industry = fields.skd_name;
    sources.industry = `${sources.skd_name ?? "register"} (SKD dejavnost)`;
  }

  // Every empty field gets a reason, including on the "found nothing" path —
  // "Nikoli ne izpiši samo 'končano'."
  for (const key of QUICK_COMPLETE_FIELDS) {
    if (!fields[key] && !fieldNotes[key]) fieldNotes[key] = "noben vir ni objavil tega podatka";
  }

  if (Object.keys(fields).length === 0 && !website) {
    // Nothing found anywhere — say exactly why, per source, instead of a
    // generic "dopolnjevanje ni uspelo".
    return {
      fields: {},
      sources: {},
      fieldNotes,
      providerNotes,
      website: null,
      description: null,
      source: providerNotes.map((p) => p.label).join(" + "),
      warning: `Za "${companyName}" ni bilo mogoče najti podatkov. ${providerNotes
        .map((p) => `${p.label}: ${p.note}`)
        .join(" · ")}`,
    };
  }

  return {
    website,
    fields,
    sources,
    fieldNotes,
    providerNotes,
    description: composeDescription(fields, description) ?? description,
    source: providerNotes.map((p) => p.label).join(" + "),
  };
}
