import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { searchWeb, scrapeUrl, isFirecrawlUnavailable } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";

const BLOCKED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "x.com",
  "twitter.com",
];

const SYSTEM_PROMPT = `Iz vsebine spletne strani podjetja izlušči kontaktne podatke in odgovori IZKLJUČNO z veljavnim JSON objektom s ključi:
"industry" (panoga/dejavnost v nekaj besedah), "email", "phone", "address_street", "address_city", "address_region", "address_country", "vat_id" (davčna/ID za DDV, npr. "SI12345678"), "description" (1-2 povedi povzetka dejavnosti).

Pravila:
- Vsak ključ izpolni SAMO, če je podatek dejansko naveden na strani. Če ga ni, ključ izpusti — ne izmišljuj.
- Telefon, email in DŠ prepiši natančno tako, kot so zapisani.
- Vse v slovenščini.`;

type Extracted = {
  industry?: string;
  email?: string;
  phone?: string;
  address_street?: string;
  address_city?: string;
  address_region?: string;
  address_country?: string;
  vat_id?: string;
  description?: string;
};

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
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

  try {
    const query = [companyName, city, "kontakt"].filter(Boolean).join(" ");
    const results = await searchWeb(query, { limit: 5, scrapeMarkdown: true, country: "SI" });

    const candidate =
      results.find(
        (r) => r.markdown && !BLOCKED_DOMAINS.some((d) => r.url.toLowerCase().includes(d))
      ) ?? results.find((r) => r.markdown);

    if (!candidate) {
      return NextResponse.json(
        { error: "AI na spletu ni našel uporabnih rezultatov za to podjetje." },
        { status: 422 }
      );
    }

    let markdown = candidate.markdown ?? "";
    if (!markdown.trim()) {
      const scraped = await scrapeUrl(candidate.url, { onlyMainContent: false });
      markdown = scraped.markdown;
    }

    const ai = await chatJSON<Extracted>(
      SYSTEM_PROMPT,
      `Podjetje: ${companyName}\n\nVsebina strani (${candidate.url}):\n\n${markdown.slice(0, 8000)}`,
      { temperature: 0.1 }
    );

    const fields: Record<string, string> = {};
    for (const key of [
      "industry",
      "email",
      "phone",
      "address_street",
      "address_city",
      "address_region",
      "address_country",
      "vat_id",
    ] as const) {
      const value = ai[key];
      if (typeof value === "string" && value.trim()) fields[key] = value.trim().slice(0, 300);
    }

    return NextResponse.json({
      website: candidate.url,
      fields,
      description: typeof ai.description === "string" ? ai.description.slice(0, 500) : null,
      source: candidate.title,
    });
  } catch (err) {
    // Firecrawl is an optional enhancement — its unavailability is a warning,
    // not a failure, so this returns 200 and the UI renders it neutrally
    // instead of as a red error.
    if (isFirecrawlUnavailable(err)) {
      console.warn(`[ai-complete] Firecrawl preskočen — ${err.detail}`);
      return NextResponse.json({
        warning: "Firecrawl preskočen (ni kreditov) — samodejno dopolnjevanje trenutno ni na voljo.",
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Dopolnjevanje ni uspelo." },
      { status: 502 }
    );
  }
}
