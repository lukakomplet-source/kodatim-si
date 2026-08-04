import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { quickComplete } from "@/lib/publicEnrichment/quickComplete";

/**
 * Step 2 of Lead skrejp: scrape ONE company through the usual chain
 * (AJPES -> CompanyWall + Bizi -> spletna stran), seeded with the identity the
 * AJPES search already returned so every source can be verified against it.
 *
 * The response is a stream of newline-delimited JSON: one `{"progress": …}`
 * line as each source starts and finishes, then a final `{"result": …}` line.
 * Without it the request is silent for half a minute and a stuck source looks
 * exactly like a slow one.
 */
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

  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : undefined);
  const companyName = str("companyName");
  if (!companyName) {
    return NextResponse.json({ error: "Manjka ime podjetja." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      try {
        const result = await quickComplete(companyName, str("city"), {
          known: {
            vat_id: str("vatId") ?? null,
            registration_number: str("registrationNumber") ?? null,
          },
          ajpesDetailUrl: str("ajpesDetailUrl") ?? null,
          onProgress: (event) => send({ progress: event }),
        });
        send({ result });
      } catch (err) {
        // A company no source knows is a result, not an error — but a genuine
        // crash still has to reach the UI instead of ending the stream silently.
        send({ error: err instanceof Error ? err.message : "Neznana napaka." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Stops proxies from buffering the stream into one delayed blob.
      "X-Accel-Buffering": "no",
    },
  });
}
