import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { scrapeUrl, isFirecrawlUnavailable } from "@/lib/firecrawl";
import { providerFetch } from "@/lib/publicEnrichment/httpClient";
import { chatJSON } from "@/lib/openai";

type LeadWebsiteExtraction = {
  name: string;
  industry: string;
  description: string;
  phone?: string;
  email?: string;
};

const SYSTEM_PROMPT = `Iz vsebine spletne strani podjetja izlušči podatke in odgovori IZKLJUČNO z veljavnim JSON objektom s ključi:
"name" (ime podjetja), "industry" (panoga/niša v nekaj besedah), "description" (kratek opis dejavnosti, 1-2 povedi, v slovenščini), "phone" (kontaktna telefonska številka podjetja, natančno tako kot je zapisana na strani), "email" (kontaktni email naslov).

Če telefona, emaila ali katerega drugega podatka na strani dejansko ni, ta ključ v odgovoru IZPUSTI — ne izmišljuj ničesar.`;

async function extractLeadInfo(
  markdown: string,
  fallbackTitle: string | null
): Promise<LeadWebsiteExtraction> {
  const truncated = markdown.slice(0, 8000);
  const parsed = await chatJSON<Partial<LeadWebsiteExtraction>>(
    SYSTEM_PROMPT,
    `Vsebina spletne strani:\n\n${truncated}`,
    { temperature: 0.1 }
  );

  return {
    name: parsed.name?.trim() || fallbackTitle || "Neznano podjetje",
    industry: parsed.industry?.trim() || "Neznano",
    description: parsed.description?.trim() || "",
    phone: parsed.phone?.trim() || undefined,
    email: parsed.email?.trim() || undefined,
  };
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };
const MIN_CONTENT = 300;

/** Reads a page without depending on Firecrawl; uses it only when plain HTML is a JS shell. */
async function readPage(url: string): Promise<{ markdown: string; title: string | null }> {
  let html: string | null = null;
  try {
    const res = await providerFetch("website", url, { headers: HEADERS });
    if (res.ok) html = await res.text();
  } catch {
    if (url.startsWith("https://")) {
      const res = await providerFetch("website", url.replace(/^https:\/\//, "http://"), { headers: HEADERS });
      if (res.ok) html = await res.text();
    }
  }

  if (html) {
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= MIN_CONTENT) return { markdown: text, title };
  }

  // Only now is Firecrawl worth trying (JS-rendered page). If it is
  // unavailable the caller turns that into a neutral warning, not an error.
  const scraped = await scrapeUrl(url, { onlyMainContent: false });
  return { markdown: scraped.markdown, title: scraped.title };
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let website: string | undefined;
  try {
    const body = await request.json();
    website = typeof body?.website === "string" ? body.website.trim() : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (!website) {
    return NextResponse.json({ error: "Vnesite website podjetja." }, { status: 400 });
  }

  let url: string;
  try {
    url = new URL(website.startsWith("http") ? website : `https://${website}`).toString();
  } catch {
    return NextResponse.json({ error: "Website ni veljaven URL." }, { status: 400 });
  }

  try {
    // Plain fetch() first — Firecrawl is only needed for JS-only pages, so a
    // missing Firecrawl balance must not break this button. Falls back to
    // http:// because small business sites often have expired certificates.
    const { markdown, title } = await readPage(url);
    const extracted = await extractLeadInfo(markdown, title);
    return NextResponse.json({
      name: extracted.name,
      industry: extracted.industry,
      description: extracted.description,
      phone: extracted.phone,
      email: extracted.email,
    });
  } catch (err) {
    if (isFirecrawlUnavailable(err)) {
      console.warn(`[lookup-website] Firecrawl preskočen — ${err.detail}`);
      return NextResponse.json({
        warning: "Firecrawl preskočen (ni kreditov) — preverjanje spletne strani trenutno ni na voljo.",
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preverjanje spletne strani ni uspelo." },
      { status: 502 }
    );
  }
}
