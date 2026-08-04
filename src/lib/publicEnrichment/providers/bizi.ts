import type { IntelLead } from "@/lib/lead-intelligence/types";
import { stripHtmlToText, firstNonEmptyLineAfter } from "../htmlText";
import { verifyNumericFields } from "../verifyNumericFields";
import { readCache, writeCache, CACHE_TTL } from "../cache";
import { providerFetch } from "../httpClient";
import { CONFIDENCE, type FieldCandidate, type ParserCheck, type ProviderRequestLog, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

// Deterministic HTML parsing — no Firecrawl, no AI, no search step at all.
// Bizi's detail-page URLs are a deterministic transformation of the company
// name (confirmed live against 4 real companies: ARHIV-PNM-D-O-O,
// ARHIVARKA-IRENA-BAUMAN-S-P, K-V-T-MOBILE-DEJAN-VIDOVIC-S-P, all matched
// exactly) — so this just constructs the URL and fetches it directly. A
// bad guess 302s to bizi.si/404, which is how "not found" is detected —
// never falls back to guessing a different company.

export const BIZI_POSSIBLE_FIELDS = [
  "registration_number", "vat_id", "founded_date", "skis_code", "skis_name",
  "industry", "address_street", "address_city", "phone", "email",
  "official_long_name", "bank_account",
];

/**
 * Everything below this line on a Bizi page is subscriber-only, so an empty
 * value there is expected rather than a parser failure and is reported as
 * such. Confirmed live: "Ta funkcionalnost je na voljo le naročnikom."
 */
const BIZI_SUBSCRIBER_ONLY = new Set(["owners", "director", "credit_rating", "revenue_amount", "profit"]);

const BASE = "https://www.bizi.si";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };

// Bump when parseDetailPage changes shape so cached entries re-parse.
const PARSER_VERSION = 5;

const DIACRITICS: Record<string, string> = {
  č: "c", ć: "c", š: "s", ž: "z", đ: "dj",
  Č: "c", Ć: "c", Š: "s", Ž: "z", Đ: "dj",
};

export function toBiziSlug(companyName: string): string {
  const transliterated = companyName.replace(/[čćšžđČĆŠŽĐ]/g, (ch) => DIACRITICS[ch] ?? ch);
  return transliterated
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toFields(values: Record<string, string | null | undefined>, sourceUrl: string): Record<string, FieldCandidate> {
  const fields: Record<string, FieldCandidate> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim()) {
      fields[key] = { value: value.trim().slice(0, 300), confidence: CONFIDENCE.BIZI_SCRAPE, source_url: sourceUrl };
    }
  }
  return fields;
}

// Address/phone/email sit in an unlabeled header block right after the
// company name, terminated by fixed boilerplate ("Več kontaktov v TIS-u") —
// confirmed live. A field can be missing (not every company lists an
// email), so classify by pattern rather than fixed position.
function extractContactBlock(text: string): { address: string | null; phone: string | null; email: string | null } {
  const anchor = "Več kontaktov v TIS-u";
  const idx = text.indexOf(anchor);
  const out: { address: string | null; phone: string | null; email: string | null } = { address: null, phone: null, email: null };
  if (idx === -1) return out;

  const before = text.slice(Math.max(0, idx - 500), idx);
  const lines = before.split("\n").map((l) => l.trim()).filter(Boolean).slice(-6);
  for (const line of lines) {
    if (/\S+@\S+\.\S+/.test(line)) out.email = line;
    else if (/^[\d\s()+-]{6,20}$/.test(line)) out.phone = line;
    else if (/\b\d{4}\b/.test(line) && line.includes(",")) out.address = line;
  }
  return out;
}

/**
 * Bizi's page title carries the full REGISTERED name — "ARHIV PNM, podjetje za
 * arhiviranje, trgovino in druge storitve, d.o.o." — while every other source
 * only has the short form ("ARHIV PNM d.o.o."). In Slovenia the long name
 * spells out what the company actually does, which makes it the single most
 * useful line for skimming a lead, so it is captured on its own.
 */
function extractLongName(text: string): string | null {
  const firstLine = text.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (!firstLine) return null;
  const name = firstLine.replace(/\s*[-–]\s*Bizi\s*$/i, "").trim();
  return name.length > 3 ? name : null;
}

function parseDetailPage(text: string): Record<string, string | null> {
  const contact = extractContactBlock(text);
  const addressParts = contact.address ? contact.address.split(",").map((p) => p.trim()) : [];
  // "Odprtih: 1 \n SI56 0451 5000 2043 037 \n (odprt 12. 06. 2012, OTP banka d.d.)"
  // A Slovenian IBAN is SI56 + 15 digits, i.e. three groups of four and a final
  // group of THREE — requiring a fourth group of four never matched.
  const bankMatch = text.match(/\b(SI56(?:\s?\d{4}){3}\s?\d{3})\b/);

  const vatDigits = firstNonEmptyLineAfter(text, "Davčna številka SI");
  // Bizi publishes SKIS — the institutional-sector code (e.g. "S.11002 —
  // Nacionalne zasebne nefinančne družbe"). That is NOT the activity
  // classification: mapping it onto skd_code/skd_name put "Nacionalne
  // zasebne nefinančne družbe" in the "SKD naziv dejavnosti" field, which is
  // meaningless as a description of what a company does. The real SKD
  // (91.120 — Dejavnost arhivov) comes from AJPES/CompanyWall, so SKIS is
  // kept under its own name and never competes with it.
  const skisRaw = firstNonEmptyLineAfter(text, "SKIS");
  const skisMatch = skisRaw?.match(/^([A-Z0-9.]+)\s*-?\s*(.*)$/);

  return {
    registration_number: firstNonEmptyLineAfter(text, "Matična"),
    vat_id: vatDigits ? `SI${vatDigits.replace(/\D/g, "")}` : null,
    founded_date: firstNonEmptyLineAfter(text, "Datum vpisa"),
    industry: firstNonEmptyLineAfter(text, "Dejavnost TSmedia"),
    skis_code: skisMatch?.[1] ?? null,
    skis_name: skisMatch?.[2]?.trim() || null,
    address_street: addressParts[0] ?? null,
    address_city: addressParts[addressParts.length - 1]?.replace(/^\d{4}\s*/, "") ?? null,
    phone: contact.phone,
    email: contact.email,
    official_long_name: extractLongName(text),
    bank_account: bankMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
  };
}

export const biziProvider: PublicEnrichmentProvider = {
  id: "bizi",
  label: "Bizi.si",
  priority: 3,
  possibleFields: BIZI_POSSIBLE_FIELDS,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    const requests: ProviderRequestLog[] = [];
    const parserChecks: ParserCheck[] = [];
    const everyFieldBecause = (reason: string): Record<string, string> =>
      Object.fromEntries(BIZI_POSSIBLE_FIELDS.map((f) => [f, reason]));

    const cached = await readCache("bizi", lead.company_name, CACHE_TTL.REGISTRY_MS, PARSER_VERSION);
    if (cached) {
      const fields = toFields(cached.parsedFields as Record<string, string>, cached.sourceUrl ?? BASE);
      const cachedReasons: Record<string, string> = {};
      for (const f of BIZI_POSSIBLE_FIELDS) {
        if (!fields[f]) cachedReasons[f] = "podatka ni bilo na strani (vrednost iz predpomnilnika)";
      }
      return {
        fields,
        note: `Bizi.si: ${Object.keys(fields).length} podatkov (iz predpomnilnika).`,
        diagnostics: {
          requests: [{ url: cached.sourceUrl ?? BASE, status: null, ok: true, note: "iz predpomnilnika — brez omrežnega klica" }],
          parserChecks: [{ element: "predpomnilnik", found: true, detail: `shranjeno ${cached.fetchedAt}` }],
          fieldReasons: cachedReasons,
        },
      };
    }

    // The lead's name doesn't always match Bizi's registered short name — the
    // lead "DEJAN VIDOVIĆ s.p." lives at /K-V-T-MOBILE-DEJAN-VIDOVIC-S-P/
    // (confirmed live). CompanyWall runs first and resolves that short name,
    // so try it as a second candidate before giving up. Still no guessing:
    // every candidate is an exact registered name, and a miss is a clean 404.
    const officialName = lead.custom_fields?.official_name;
    const candidates = [...new Set([lead.company_name, officialName].filter(Boolean).map((n) => toBiziSlug(n as string)))].filter(Boolean);

    if (candidates.length === 0) {
      const note = "Bizi.si: imena podjetja ni bilo mogoče pretvoriti v naslov strani.";
      return { note, skippedReason: note, diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause("iz imena podjetja ni bilo mogoče sestaviti naslova Bizi strani") } };
    }

    try {
      let detailUrl: string | null = null;
      let html: string | null = null;

      for (const slug of candidates) {
        const url = `${BASE}/${slug}/`;
        const res = await providerFetch("bizi", url, { headers: HEADERS });
        const redirectedTo404 = res.url.includes("/404");
        requests.push({
          url,
          status: res.status,
          ok: res.ok && !redirectedTo404,
          note: redirectedTo404 ? "preusmeritev na /404 — podjetje pod tem imenom ni objavljeno" : undefined,
        });
        if (!res.ok) throw new Error(`Bizi.si stran ni dosegljiva (${res.status})`);
        if (redirectedTo404) continue;
        detailUrl = url;
        html = await res.text();
        break;
      }

      parserChecks.push({
        element: "naslov strani iz imena podjetja (slug)",
        found: Boolean(detailUrl),
        detail: detailUrl ? `zadel: ${detailUrl}` : `preizkušeni naslovi: ${candidates.join(", ")} — vsi 404`,
      });

      if (!detailUrl || html === null) {
        const note = "Bizi.si: ni bilo mogoče najti javne strani podjetja.";
        return {
          note,
          skippedReason: note,
          diagnostics: {
            requests,
            parserChecks,
            fieldReasons: everyFieldBecause(`podjetje ni objavljeno na Bizi.si (404 na ${candidates.length} preizkušenih naslovih)`),
          },
        };
      }

      const text = stripHtmlToText(html);

      const parsed = parseDetailPage(text);
      parserChecks.push({
        element: 'kontaktni blok ("Več kontaktov v TIS-u")',
        found: Boolean(parsed.phone || parsed.email || parsed.address_street),
        detail: parsed.phone || parsed.email || parsed.address_street ? "najden" : "sidro ni najdeno — telefon/email/naslov niso na voljo",
      });
      parserChecks.push({
        element: 'oznaka "Matična"',
        found: Boolean(parsed.registration_number),
        detail: parsed.registration_number ? "najdena" : "oznaka ni najdena na strani",
      });
      const fields = verifyNumericFields(toFields(parsed, detailUrl), text);
      const count = Object.keys(fields).length;

      await writeCache("bizi", lead.company_name, html, parsed, detailUrl, PARSER_VERSION);

      const fieldReasons: Record<string, string> = {};
      for (const f of BIZI_POSSIBLE_FIELDS) {
        if (fields[f]) continue;
        fieldReasons[f] = BIZI_SUBSCRIBER_ONLY.has(f)
          ? "na Bizi.si samo za naročnike — pridobljeno iz AJPES/CompanyWall"
          : parsed[f] === null || parsed[f] === undefined
            ? "podatka ni na javni strani Bizi.si"
            : "vrednost zavrnjena pri preverjanju (ni se ujemala z besedilom strani)";
      }

      return {
        fields,
        note:
          count > 0
            ? `Bizi.si: najdenih ${count} javnih podatkov.`
            : `Bizi.si: stran najdena, dodatnih javnih podatkov ni bilo mogoče izluščiti.`,
        diagnostics: { requests, parserChecks, fieldReasons },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      // Network/HTTP failure — a real malfunction. (A 404 redirect, i.e. the
      // company genuinely isn't on Bizi, is handled above as a plain skip.)
      return {
        note: `Bizi.si: napaka — ${message}`,
        failed: true,
        diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(`napaka pri branju strani: ${message}`) },
      };
    }
  },
};
