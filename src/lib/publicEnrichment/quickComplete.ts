import { isFirecrawlUnavailable } from "@/lib/firecrawl";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { providerFetch } from "./httpClient";
import { searchForWebsite } from "./websiteSearch";
import { ajpesProvider, ajpesSkipReason } from "./providers/ajpes";
import { companyWallProvider, PEOPLE_SEPARATOR } from "./providers/companywall";
import { biziProvider } from "./providers/bizi";
import { websiteProvider } from "./providers/website";
import { identityConflict, mergeIdentity, type CompanyIdentity } from "./identity";
import {
  PUBLIC_ENRICHMENT_SOURCE_LABELS,
  type PublicEnrichmentProvider,
  type PublicEnrichmentSourceId,
  type PublicProviderResult,
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
  "other_activities",
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

  // Everything else the company is registered for. Often a long list, and the
  // fullest available answer to "what else could they need from us".
  if (fields.other_activities) {
    lines.push(`Druge registrirane dejavnosti: ${fields.other_activities}`);
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
/**
 * Registries print these instead of a name when nobody is recorded. They are
 * not people and must never become a contact — "USTANOVITELJ NI VPISAN" was
 * showing up in the Kontaktne osebe column.
 */
export function isPlaceholderName(value: string): boolean {
  return /\bni vpisan|ni podatka|^-+$/i.test(value.trim());
}

function collectContactPersons(fields: Record<string, string>): string[] {
  const raw = [fields.director, fields.owners, fields.authorized_representatives]
    .filter(Boolean)
    .flatMap((value) => value.split(PEOPLE_SEPARATOR))
    .filter((name) => !isPlaceholderName(name));

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

/** A single readable line about what the scrape is doing right now. */
export type ScrapeProgress = {
  /** Which source, e.g. "CompanyWall". */
  label: string;
  /** Slovenian, human-readable — shown verbatim in the live log. */
  note: string;
  state: "start" | "done" | "info";
  ms?: number;
};

export type QuickCompleteOptions = {
  /**
   * Identity already established elsewhere — the AJPES search results on the
   * Lead skrejp screen already carry davčna and matična, so every later source
   * can be checked against them from the very first provider instead of
   * trusting whichever registry happened to answer first.
   */
  known?: CompanyIdentity;
  /** The AJPES company page, when the caller already resolved it — saves a search. */
  ajpesDetailUrl?: string | null;
  /**
   * The full registered name, when the caller searched by the short one.
   * "2-MB d.o.o." carries no searchable words; "2-MB, storitvene dejavnosti v
   * kopenskem prometu, d.o.o." does.
   */
  officialName?: string | null;
  /** Called as each step starts and finishes, so the UI can show live progress. */
  onProgress?: (event: ScrapeProgress) => void;
};

export async function quickComplete(
  companyName: string,
  city?: string,
  options: QuickCompleteOptions = {}
): Promise<QuickCompleteResult> {
  const { known, ajpesDetailUrl, officialName, onProgress } = options;
  const report = (label: string, note: string, state: ScrapeProgress["state"] = "info", ms?: number) =>
    onProgress?.({ label, note, state, ms });

  const fields: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const fieldNotes: Record<string, string> = {};
  const providerNotes: { label: string; note: string }[] = [];
  let website: string | null = null;
  let description: string | null = null;

  // Mutable working lead so each provider sees what the previous one resolved
  // (CompanyWall's official name is what lets Bizi build the right URL).
  // Identity the caller already has goes into custom_fields, not just into the
  // output: that is where the providers read it from. Without this, CompanyWall
  // reported "davčna ni bila znana" and gave up on companies it could have
  // verified by tax number — while the number sat right there in the AJPES
  // search row that started the scrape.
  const working: Record<string, unknown> = {
    company_name: companyName,
    address_city: city || null,
    custom_fields: {
      ...(ajpesDetailUrl ? { ajpes_detail_url: ajpesDetailUrl } : {}),
      ...(known?.vat_id ? { vat_id: known.vat_id } : {}),
      ...(known?.registration_number ? { registration_number: known.registration_number } : {}),
      // The full registered name is a far better second search term than the
      // short one ("2-MB d.o.o." vs "2-MB, storitvene dejavnosti v kopenskem
      // prometu, d.o.o.") for both CompanyWall and website search.
      ...(officialName ? { official_name: officialName } : {}),
    } as Record<string, string>,
  };

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

  /** Folds one provider's result into the running answer, in priority order. */
  const absorb = (provider: PublicEnrichmentProvider, result: PublicProviderResult) => {
    const claimed: CompanyIdentity = {
      vat_id: result.fields?.vat_id?.value ?? null,
      registration_number: result.fields?.registration_number?.value ?? null,
    };

    const conflict = identityConflict(identity, claimed);
    if (conflict) {
      providerNotes.push({ label: provider.label, note: `podatki zavrnjeni — ${conflict}` });
      report(provider.label, `podatki zavrnjeni — ${conflict}`);
      return;
    }
    identity = mergeIdentity(identity, claimed);
    providerNotes.push({ label: provider.label, note: result.note });

    for (const [key, candidate] of Object.entries(result.fields ?? {})) {
      if (!candidate?.value) continue;
      if (key === "website" && !website) website = candidate.value;
      if (key === "description" && !description) description = candidate.value;

      // Feed identity forward for whatever runs next.
      (working.custom_fields as Record<string, string>)[key] = candidate.value;
      if (key === "address_city" && !working.address_city) working.address_city = candidate.value;

      if (!QUICK_COMPLETE_FIELDS.includes(key)) continue;
      // First (highest-priority) source wins — except for the activity name,
      // where AJPES publishes a squashed abbreviation ("Prid.žit(razen riža),
      // stročnic in oljnic") and CompanyWall the spelled-out official name.
      const preferLonger = key === "skd_name" && candidate.value.length > (fields[key]?.length ?? 0);
      if (fields[key] && !preferLonger) continue;
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
  };

  const runProvider = async (provider: PublicEnrichmentProvider): Promise<PublicProviderResult | null> => {
    const startedAt = Date.now();
    report(provider.label, "poizvedujem …", "start");
    try {
      const result = await provider.run(working as unknown as IntelLead);
      report(provider.label, result.note, "done", Date.now() - startedAt);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      providerNotes.push({ label: provider.label, note: `napaka — ${message}` });
      report(provider.label, `napaka — ${message}`, "done", Date.now() - startedAt);
      return null;
    }
  };

  // AJPES goes first and alone: it establishes the identity and the registered
  // names the other two search by. CompanyWall and Bizi then run together —
  // neither depends on the other, and running them in sequence meant waiting
  // out both providers' rate limits back to back instead of side by side.
  //
  // In a bulk run the identity is already known (the Lead skrejp search
  // returned davčna and matična for every row), and AJPES is the slowest link
  // in the chain — so the worker is allowed to skip it. Off by default here.
  const skipAjpes = ajpesSkipReason(working as unknown as IntelLead);
  if (skipAjpes) {
    providerNotes.push({ label: ajpesProvider.label, note: skipAjpes });
    report(ajpesProvider.label, skipAjpes, "info");
  } else {
    const ajpesResult = await runProvider(ajpesProvider);
    if (ajpesResult) absorb(ajpesProvider, ajpesResult);
  }

  const [companyWallResult, biziResult] = await Promise.all([
    runProvider(companyWallProvider),
    runProvider(biziProvider),
  ]);
  if (companyWallResult) absorb(companyWallProvider, companyWallResult);
  if (biziResult) absorb(biziProvider, biziResult);

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

  // A domain already tried and rejected above must not be fetched again by the
  // search — that cost a full timeout twice for the same dead host.
  const triedHosts: string[] = [];
  {
    const guess = websiteFromEmail(fields.email);
    if (guess && !website) triedHosts.push(guess);
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
    report("Spletno iskanje", "iščem uradno spletno stran …", "start");
    const startedAt = Date.now();
    const found = await searchForWebsite(companyName, {
      city,
      vatId: fields.vat_id,
      skipHosts: triedHosts,
      // A short name can be all punctuation and initials; the registered long
      // name is what actually has words to search with.
      fallbackName: fields.official_long_name || officialName || null,
    });
    website = found.website;
    websiteNote = found.note;
    providerNotes.push({ label: "Spletno iskanje", note: found.note });
    report("Spletno iskanje", found.note, "done", Date.now() - startedAt);
  }

  // Optional final pass: if a website turned up, read it for anything still
  // missing. Plain fetch() first, Firecrawl only for JS-only pages — so a
  // missing Firecrawl balance costs nothing here.
  let siteDescription: string | null = null;
  if (website) {
    const startedAt = Date.now();
    report(websiteProvider.label, `berem ${website} …`, "start");
    try {
      const result = await websiteProvider.run({ ...working, website } as unknown as IntelLead);
      providerNotes.push({ label: websiteProvider.label, note: result.note });
      report(websiteProvider.label, result.note, "done", Date.now() - startedAt);
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

  // Drop registry placeholders before anything reads them as a person's name.
  for (const key of ["director", "owners", "authorized_representatives"]) {
    if (fields[key] && isPlaceholderName(fields[key])) {
      fieldNotes[key] = `${sources[key] ?? "vir"}: oseba ni vpisana v register`;
      delete fields[key];
      delete sources[key];
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
