import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { quickComplete } from "@/lib/publicEnrichment/quickComplete";

/**
 * Scrapes a batch of companies in ONE request, streaming a line per event.
 *
 * One request per company looked simpler but breaks in production: each
 * concurrent request lands on its own serverless instance, so the shared AJPES
 * session and the lock that serialises its stateful select-then-read (module
 * state) do not apply across them. Several instances then log into the one
 * AJPES account at once and invalidate each other's cookies — the exact
 * collision that returns empty rows. Handling a batch inside a single function
 * gives one session, one working lock, and one login.
 *
 * The client sends batches sequentially, so two of these are never in flight at
 * the same time.
 */

export const runtime = "nodejs";
// Scraping is minutes of waiting on other people's servers, not CPU. Without
// this the platform's short default cut the function off mid-company and the
// browser saw a truncated stream ("Skrejp se ni zaključil"). Capped by the
// hosting plan, which is why the client also keeps batches small.
export const maxDuration = 300;

type CompanyInput = {
  index: number;
  name: string;
  searchName: string;
  city: string | null;
  vatId: string | null;
  registrationNumber: string | null;
  ajpesDetailUrl: string | null;
};

function parseCompanies(value: unknown): CompanyInput[] {
  if (!Array.isArray(value)) return [];
  const out: CompanyInput[] = [];
  for (const raw of value.slice(0, 50)) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const str = (key: string) => (typeof r[key] === "string" ? (r[key] as string).trim() || null : null);
    const searchName = str("searchName") ?? str("name");
    if (!searchName) continue;
    out.push({
      index: typeof r.index === "number" ? r.index : out.length,
      name: str("name") ?? searchName,
      searchName,
      city: str("city"),
      vatId: str("vatId"),
      registrationNumber: str("registrationNumber"),
      ajpesDetailUrl: str("ajpesDetailUrl"),
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const companies = parseCompanies(body.companies);
  if (companies.length === 0) {
    return NextResponse.json({ error: "Ni podjetij za skrejp." }, { status: 400 });
  }
  const concurrency = Math.min(Math.max(Number(body.concurrency) || 1, 1), 5);
  // "Hitro" trades AJPES's detail fields for speed — per request, not env.
  const skipAjpesWhenKnown = body.skipAjpesWhenKnown === true;
  // "Samo kontakti": only email + phone, skipping the two heaviest steps.
  const contactsOnly = body.contactsOnly === true;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // The client went away (stopped, navigated). Stop writing.
          closed = true;
        }
      };

      // Rather than trusting maxDuration — the hosting plan silently caps it,
      // and an over-run kills the function mid-company — the batch stops
      // handing out new work once the budget is spent and reports what it did
      // not get to. The client re-queues those, so a slow company is retried
      // instead of being marked failed.
      const budgetMs = Number(process.env.SCRAPE_BATCH_BUDGET_MS ?? 25_000);
      const unprocessed: number[] = [];

      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const company = companies[cursor++];
          if (!company || closed) return;
          if (Date.now() - startedAt > budgetMs) {
            unprocessed.push(company.index);
            continue;
          }
          const companyStartedAt = Date.now();
          try {
            const result = await quickComplete(company.searchName, company.city ?? undefined, {
              known: {
                vat_id: company.vatId,
                registration_number: company.registrationNumber,
              },
              ajpesDetailUrl: company.ajpesDetailUrl,
              officialName: company.name,
              skipAjpesWhenKnown,
              contactsOnly,
              onProgress: (event) => send({ progress: { ...event, index: company.index, company: company.name } }),
            });
            send({ row: { index: company.index, result, ms: Date.now() - companyStartedAt } });
          } catch (err) {
            send({
              rowError: {
                index: company.index,
                error: err instanceof Error ? err.message : "Neznana napaka.",
              },
            });
          }
        }
      };

      try {
        // AJPES is serialised internally regardless; this only parallelises
        // CompanyWall, Bizi and website work across companies.
        await Promise.all(Array.from({ length: concurrency }, worker));
        send({ done: { ms: Date.now() - startedAt, unprocessed } });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
