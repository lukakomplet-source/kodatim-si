import type { IntelLead } from "@/lib/lead-intelligence/types";
import { stripHtmlToText, firstNonEmptyLineAfter } from "../htmlText";
import { verifyNumericFields } from "../verifyNumericFields";
import { readCache, writeCache, CACHE_TTL } from "../cache";
import { politeFetch } from "../politeFetch";
import { CONFIDENCE, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

// Deterministic HTML parsing — no Firecrawl, no AI, no search step at all.
// Bizi's detail-page URLs are a deterministic transformation of the company
// name (confirmed live against 4 real companies: ARHIV-PNM-D-O-O,
// ARHIVARKA-IRENA-BAUMAN-S-P, K-V-T-MOBILE-DEJAN-VIDOVIC-S-P, all matched
// exactly) — so this just constructs the URL and fetches it directly. A
// bad guess 302s to bizi.si/404, which is how "not found" is detected —
// never falls back to guessing a different company.

export const BIZI_POSSIBLE_FIELDS = [
  "registration_number", "vat_id", "founded_date", "skd_code", "skd_name",
  "industry", "address_street", "address_city", "phone", "email",
];

const BASE = "https://www.bizi.si";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };

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

function parseDetailPage(text: string): Record<string, string | null> {
  const contact = extractContactBlock(text);
  const addressParts = contact.address ? contact.address.split(",").map((p) => p.trim()) : [];

  const vatDigits = firstNonEmptyLineAfter(text, "Davčna številka SI");
  const skdRaw = firstNonEmptyLineAfter(text, "SKIS");
  const skdMatch = skdRaw?.match(/^([A-Z0-9.]+)\s*-?\s*(.*)$/);

  return {
    registration_number: firstNonEmptyLineAfter(text, "Matična"),
    vat_id: vatDigits ? `SI${vatDigits.replace(/\D/g, "")}` : null,
    founded_date: firstNonEmptyLineAfter(text, "Datum vpisa"),
    industry: firstNonEmptyLineAfter(text, "Dejavnost TSmedia"),
    skd_code: skdMatch?.[1] ?? null,
    skd_name: skdMatch?.[2]?.trim() || null,
    address_street: addressParts[0] ?? null,
    address_city: addressParts[addressParts.length - 1]?.replace(/^\d{4}\s*/, "") ?? null,
    phone: contact.phone,
    email: contact.email,
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
    const cached = await readCache("bizi", lead.company_name, CACHE_TTL.REGISTRY_MS);
    if (cached) {
      const fields = toFields(cached.parsedFields as Record<string, string>, cached.sourceUrl ?? BASE);
      return { fields, note: `Bizi.si: ${Object.keys(fields).length} podatkov (iz predpomnilnika).` };
    }

    const slug = toBiziSlug(lead.company_name);
    if (!slug) {
      const note = "Bizi.si: imena podjetja ni bilo mogoče pretvoriti v naslov strani.";
      return { note, skippedReason: note };
    }

    const detailUrl = `${BASE}/${slug}/`;
    try {
      const res = await politeFetch(detailUrl, { headers: HEADERS });
      if (!res.ok) throw new Error(`Bizi.si stran ni dosegljiva (${res.status})`);
      if (res.url.includes("/404")) {
        const note = "Bizi.si: ni bilo mogoče najti javne strani podjetja.";
        return { note, skippedReason: note };
      }

      const html = await res.text();
      const text = stripHtmlToText(html);

      const parsed = parseDetailPage(text);
      const fields = verifyNumericFields(toFields(parsed, detailUrl), text);
      const count = Object.keys(fields).length;

      await writeCache("bizi", lead.company_name, html, parsed, detailUrl);

      return {
        fields,
        note:
          count > 0
            ? `Bizi.si: najdenih ${count} javnih podatkov.`
            : `Bizi.si: stran najdena, dodatnih javnih podatkov ni bilo mogoče izluščiti.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      // Network/HTTP failure — a real malfunction. (A 404 redirect, i.e. the
      // company genuinely isn't on Bizi, is handled above as a plain skip.)
      return { note: `Bizi.si: napaka — ${message}`, failed: true };
    }
  },
};
