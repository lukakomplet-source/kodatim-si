import { isFirecrawlUnavailable } from "@/lib/firecrawl";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { providerFetch } from "./httpClient";
import { searchForWebsite } from "./websiteSearch";
import { ajpesProvider } from "./providers/ajpes";
import { companyWallProvider, PEOPLE_SEPARATOR } from "./providers/companywall";
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
  "owners", "authorized_representatives", "founded_date", "legal_form", "company_status",
  "company_size", "employees_count", "revenue_amount", "revenue_year", "profit", "ebitda",
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
/**
 * The "what is this company" block that lands in Opombe.
 *
 * Written as a few labelled lines rather than one run-on sentence, because it
 * is read while skimming a list of leads. What the company DOES comes first —
 * the SKD activity, then the full registered name (in Slovenia that name spells
 * the activities out: "ARHIV PNM, podjetje za arhiviranje, trgovino in druge
 * storitve, d.o.o."), then, when a verified website exists, what the company
 * says about its own services. Numbers always come from the registries, never
 * from the website.
 */
function composeDescription(
  fields: Record<string, string>,
  registryDescription: string | null,
  siteDescription: string | null,
  website: string | null,
  websiteNote: string
): string | null {
  const lines: string[] = [];

  const activity = fields.industry || fields.skd_name;
  const skd = fields.skd_code && fields.skd_name ? `SKD ${fields.skd_code} — ${fields.skd_name}` : null;
  if (activity || skd) {
    lines.push(`Dejavnost: ${[activity, skd && skd !== activity ? `(${skd})` : null].filter(Boolean).join(" ")}`);
  }

  const longName = fields.official_long_name || fields.official_name;
  if (longName) lines.push(`Registrirano ime: ${longName}`);

  if (siteDescription) {
    lines.push(`S spletne strani (${website}): ${siteDescription}`);
  } else if (website) {
    lines.push(`Spletna stran: ${website} — opisa dejavnosti z nje ni bilo mogoče izluščiti.`);
  } else {
    lines.push(`Spletna stran: ${websiteNote}`);
  }

  // A registry sometimes carries its own sentence; keep it when it adds
  // something the registered name doesn't already say.
  if (registryDescription && longName && !registryDescription.includes(longName)) {
    lines.push(`Iz registra: ${registryDescription}`);
  }

  const facts: string[] = [];
  // Only a real headcount reads as "N zaposlenih"; a size class is printed as-is.
  if (fields.employees_count && /^\d/.test(fields.employees_count)) {
    facts.push(`${fields.employees_count} zaposlenih`);
  }
  if (fields.company_size && /mikro|majhn|srednj|velik/i.test(fields.company_size)) {
    facts.push(fields.company_size.toLowerCase());
  }
  if (fields.revenue_amount) {
    facts.push(`prihodki ${fields.revenue_amount} €${fields.revenue_year ? ` (${fields.revenue_year})` : ""}`);
  }
  if (fields.profit) facts.push(`dobiček ${fields.profit} €`);
  if (fields.credit_rating) facts.push(`boniteta ${fields.credit_rating}`);
  if (fields.founded_date) facts.push(`ustanovljeno ${fields.founded_date}`);
  if (fields.legal_form) facts.push(fields.legal_form.toLowerCase());
  // AJPES writes the legal form as "Družba z omejeno odgovornostjo d.o.o.",
  // which already ends in a dot — joining a sentence period onto that gave "..".
  if (facts.length > 0) lines.push(`Podatki: ${facts.join(", ").replace(/\.+$/, "")}.`);

  const address = [fields.address_street, [fields.postal_code, fields.address_city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (address) lines.push(`Sedež: ${address}.`);

  const people: string[] = [];
  if (fields.director) people.push(`direktor ${fields.director}`);
  if (fields.owners) people.push(`lastniki ${fields.owners}`);
  if (fields.authorized_representatives) people.push(`prokurist ${fields.authorized_representatives}`);
  if (people.length > 0) lines.push(`Osebe: ${people.join("; ")}.`);

  if (fields.company_status && isBankrupt(fields.company_status)) {
    lines.push(`⚠ Status: ${fields.company_status} — pred kontaktom preverite, ali je lead sploh smiseln.`);
  }

  if (lines.length === 0) return registryDescription;
  return lines.join("\n");
}

/**
 * A company in receivership or liquidation is not a sales lead. It is flagged
 * so the UI can mark it, and so the pipeline can skip work that makes no sense
 * for it (a bankrupt company no longer runs a website).
 */
export function isBankrupt(status?: string | null): boolean {
  return /steč|likvidac|prisiln|izbrisan/i.test(status ?? "");
}

/**
 * Every person the registries name — director, owners, prokurist — as a clean
 * list for the "Kontaktne osebe" field. Ownership shares are stripped
 * ("RICHTER MARTIN(50,00%)" -> "RICHTER MARTIN") and the same person named in
 * two roles appears once.
 */
function collectContactPersons(fields: Record<string, string>): string[] {
  const raw = [fields.director, fields.owners, fields.authorized_representatives]
    .filter(Boolean)
    .flatMap((value) => value.split(PEOPLE_SEPARATOR));

  // Sources disagree on word order and casing for the same person — AJPES says
  // "Irena Bauman", CompanyWall "BAUMAN IRENA". Keying on the sorted words
  // collapses them into one contact instead of two.
  const byPerson = new Map<string, string>();
  for (const entry of raw) {
    const name = entry
      .replace(/\([^)]*%\)/g, "") // ownership share
      .replace(/\s*[-–]\s*(direktor|prokurist|zastopnik|lastnik)\.?$/i, "") // trailing role
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 3) continue;

    const key = name
      .toLowerCase()
      .replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "d")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");

    const display = isAllCaps(name) ? toTitleCase(name) : name;
    const existing = byPerson.get(key);
    // Prefer the readable form over the registry's shouting caps.
    if (!existing || (isAllCaps(existing) && !isAllCaps(display))) byPerson.set(key, display);
  }
  return [...byPerson.values()];
}

function isAllCaps(value: string): boolean {
  return value === value.toUpperCase() && /[A-ZČŠŽĐĆ]/.test(value);
}

function toTitleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

export type QuickCompleteResult = {
  website: string | null;
  /** Why the website is what it is — including "nima spletne strani" when none exists. */
  websiteNote: string;
  fields: Record<string, string>;
  sources: Record<string, string>;
  fieldNotes: Record<string, string>;
  providerNotes: { label: string; note: string }[];
  /** Director, owners and prokurist, deduplicated — fills "Kontaktne osebe". */
  contactPersons: string[];
  /** True for a company in receivership/liquidation — shown as a red badge. */
  bankrupt: boolean;
  description: string | null;
  source: string;
  /** Set only when nothing at all could be found — the UI shows it in amber, never red. */
  warning?: string;
};

export async function quickComplete(
  companyName: string,
  city?: string,
  /**
   * Identity already established elsewhere — the AJPES search results on the
   * Lead skrejp screen already carry davčna and matična, so every later source
   * can be checked against them from the very first provider instead of
   * trusting whichever registry happened to answer first.
   */
  known?: CompanyIdentity
): Promise<QuickCompleteResult> {
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
  let identity: CompanyIdentity = {
    vat_id: known?.vat_id ?? null,
    registration_number: known?.registration_number ?? null,
  };
  if (known?.vat_id) {
    fields.vat_id = known.vat_id;
    sources.vat_id = "AJPES";
  }
  if (known?.registration_number) {
    fields.registration_number = known.registration_number;
    sources.registration_number = "AJPES";
  }

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

  const bankrupt = isBankrupt(fields.company_status);
  let websiteNote = website ? "objavljena v registru." : "";

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
          websiteNote = `ugotovljena iz e-poštne domene (${guess}) in preverjena — HTTP ${res.status}.`;
        } else {
          websiteNote = `domena iz e-pošte (${guess}) je vrnila HTTP ${res.status} — ni uporabljena.`;
        }
      } catch {
        websiteNote = `domena iz e-pošte (${guess}) se ni odzvala — ni uporabljena.`;
      }
      providerNotes.push({ label: "Spletna stran", note: websiteNote });
    }
  }

  // Still nothing: search the web. Skipped for companies in receivership or
  // liquidation — they no longer run a site, so the requests would only cost
  // time and every hit would be a false positive.
  if (!website && bankrupt) {
    websiteNote = `iskanje preskočeno — podjetje je ${fields.company_status?.toLowerCase()}, zato spletne strani ne pričakujemo.`;
    providerNotes.push({ label: "Spletna stran", note: websiteNote });
  } else if (!website && !fields.vat_id && !fields.registration_number) {
    // Without a resolved davčna/matična there is nothing to verify a search hit
    // against, and an unverified hit is how "ARS" ended up pointing at
    // arstechnica.com. Better no website than the wrong one.
    websiteNote =
      "iskanje preskočeno — podjetje ni bilo enolično določeno (brez davčne/matične), zato zadetka ni mogoče preveriti.";
    providerNotes.push({ label: "Spletna stran", note: websiteNote });
  } else if (!website) {
    const found = await searchForWebsite(companyName, { city, vatId: fields.vat_id });
    website = found.website;
    websiteNote = found.note;
    providerNotes.push({ label: "Spletno iskanje", note: found.note });
  }

  // Optional final pass: if a website turned up, read it for anything still
  // missing. Plain fetch() first, Firecrawl only for JS-only pages — so a
  // missing Firecrawl balance costs nothing here.
  let siteDescription: string | null = null;
  if (website) {
    try {
      const result = await websiteProvider.run({ ...working, website } as unknown as IntelLead);
      providerNotes.push({ label: websiteProvider.label, note: result.note });
      // What the company says it does, in its own words. Kept separate from the
      // registry fields: it is prose for Opombe, not a value for a column.
      siteDescription = result.fields?.description?.value ?? null;
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
      websiteNote: websiteNote || "ni bilo mogoče preveriti — podjetja ni bilo mogoče identificirati.",
      contactPersons: [],
      bankrupt,
      description: null,
      source: providerNotes.map((p) => p.label).join(" + "),
      warning: `Za "${companyName}" ni bilo mogoče najti podatkov. ${providerNotes
        .map((p) => `${p.label}: ${p.note}`)
        .join(" · ")}`,
    };
  }

  return {
    website,
    websiteNote: website ? websiteNote : websiteNote || "nima spletne strani — v nobenem viru je ni bilo mogoče najti.",
    fields,
    sources,
    fieldNotes,
    providerNotes,
    contactPersons: collectContactPersons(fields),
    bankrupt,
    description: composeDescription(fields, description, siteDescription, website, websiteNote) ?? description,
    source: providerNotes.map((p) => p.label).join(" + "),
  };
}
