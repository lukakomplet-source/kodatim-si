import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isFirecrawlUnavailable } from "@/lib/firecrawl";
import { providerFetch } from "@/lib/publicEnrichment/httpClient";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { ajpesProvider } from "@/lib/publicEnrichment/providers/ajpes";
import { companyWallProvider } from "@/lib/publicEnrichment/providers/companywall";
import { biziProvider } from "@/lib/publicEnrichment/providers/bizi";
import { websiteProvider } from "@/lib/publicEnrichment/providers/website";
import {
  PUBLIC_ENRICHMENT_SOURCE_LABELS,
  type PublicEnrichmentProvider,
  type PublicEnrichmentSourceId,
} from "@/lib/publicEnrichment/types";

/**
 * "AI dopolni vse" on the import screen.
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

/** Extra values worth returning even though the form has no dedicated input. */
const EXTRA_FIELDS = ["skd_code", "skd_name", "registration_number", "director", "founded_date", "legal_form"] as const;

const WANTED: readonly string[] = [...FORM_FIELDS, ...EXTRA_FIELDS];

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
 * the list can be skimmed without opening each lead. Built from registry data
 * (always available when a registry matched) and enriched by the website
 * summary when one exists.
 */
function composeDescription(
  fields: Record<string, string>,
  registryDescription?: string | null,
  officialName?: string
): string | null {
  // Plain-language activity first ("Arhiviranje"), then the official SKD
  // classification, then the registered long name — which in Slovenia often
  // spells the activities out ("… podjetje za arhiviranje, trgovino in druge
  // storitve, d.o.o.") and is the most informative line of the three.
  const parts: string[] = [];
  const activity = fields.industry || fields.skd_name;
  if (activity) parts.push(activity);
  if (fields.skd_name && fields.skd_name !== activity) {
    parts.push(`SKD ${fields.skd_code ?? ""} ${fields.skd_name}`.trim());
  }

  const longName = registryDescription && registryDescription.length > 25 ? registryDescription : officialName;
  if (longName && !parts.some((p) => p === longName)) parts.push(longName);

  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let companyName: string | undefined;
  let city: string | undefined;
  try {
    const body = await request.json();
    companyName = typeof body?.companyName === "string" ? body.companyName.trim() : undefined;
    city = typeof body?.city === "string" ? body.city.trim() : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (!companyName) {
    return NextResponse.json({ error: "Najprej vnesite ime podjetja." }, { status: 400 });
  }

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

  for (const provider of chain) {
    try {
      const result = await provider.run(working as unknown as IntelLead);
      providerNotes.push({ label: provider.label, note: result.note });

      for (const [key, candidate] of Object.entries(result.fields ?? {})) {
        if (!candidate?.value) continue;
        if (key === "website" && !website) website = candidate.value;
        if (key === "description" && !description) description = candidate.value;

        // Feed identity forward for the next provider in the chain.
        (working.custom_fields as Record<string, string>)[key] = candidate.value;
        if (key === "address_city" && !working.address_city) working.address_city = candidate.value;

        if (!WANTED.includes(key)) continue;
        if (fields[key]) continue; // first (highest-priority) source wins
        fields[key] = candidate.value;
        sources[key] = PUBLIC_ENRICHMENT_SOURCE_LABELS[provider.id as PublicEnrichmentSourceId] ?? provider.id;
      }

      // Keep the FIRST provider's reason — the chain runs in authority order,
      // so AJPES's "AMBIGUOUS MATCH" is the root cause worth showing, not
      // Bizi's downstream 404 that merely follows from it.
      for (const [key, reason] of Object.entries(result.diagnostics?.fieldReasons ?? {})) {
        if (WANTED.includes(key) && !fields[key] && !fieldNotes[key]) {
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
          providerNotes.push({ label: "Spletna stran", note: `ugotovljena iz e-poštne domene (${guess}) in preverjena — HTTP ${res.status}.` });
        }
      } catch {
        providerNotes.push({ label: "Spletna stran", note: `domena iz e-pošte (${guess}) se ni odzvala — ni uporabljena.` });
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
        if (!candidate?.value || !WANTED.includes(key) || fields[key]) continue;
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

  const filled = Object.keys(fields).length;
  if (filled === 0 && !website) {
    // Nothing found anywhere — say exactly why, per source, instead of a
    // generic "dopolnjevanje ni uspelo".
    return NextResponse.json({
      fields: {},
      sources: {},
      fieldNotes,
      providerNotes,
      website: null,
      description: null,
      warning: `Za "${companyName}" ni bilo mogoče najti podatkov. ${providerNotes
        .map((p) => `${p.label}: ${p.note}`)
        .join(" · ")}`,
    });
  }

  for (const key of WANTED) {
    if (!fields[key] && !fieldNotes[key]) fieldNotes[key] = "noben vir ni objavil tega podatka";
  }

  // Notes get a short "what they do" line for quick skimming. A registry
  // "description" is often just the long registered name, so the activity
  // (SKD naziv / panoga) leads and the name only adds detail.
  const officialName = (working.custom_fields as Record<string, string>).official_name;
  const composed = composeDescription(fields, description, officialName);
  const finalDescription = composed ?? description;

  return NextResponse.json({
    website,
    fields,
    sources,
    fieldNotes,
    providerNotes,
    description: finalDescription,
    source: providerNotes.map((p) => p.label).join(" + "),
  });
}
