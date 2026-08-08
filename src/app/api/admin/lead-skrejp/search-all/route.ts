import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  rootSlices,
  runSlice,
  sliceLabel,
  type SearchBase,
  type SearchSlice,
} from "@/lib/publicEnrichment/ajpesExhaustive";

/**
 * Discovery that does not stop at AJPES's hundred-row cap.
 *
 * The client holds the queue of slices still to run and sends them back a batch
 * at a time; this route works through as many as its time budget allows and
 * returns the rest, plus any new sub-slices a capped slice produced. Same shape
 * as the scrape route, and for the same reason: a big SKD code is a few hundred
 * queries at ~5 s each, which no single serverless invocation will survive.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

/** Generous, and deliberately not a silent truncation — a dropped slice is a
 * set of companies that would never appear and nobody would know. */
const MAX_QUEUE = 20_000;

function parseSlices(value: unknown): SearchSlice[] {
  if (!Array.isArray(value)) return [];
  const out: SearchSlice[] = [];
  for (const raw of value.slice(0, MAX_QUEUE)) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const str = (key: string) => (typeof r[key] === "string" ? (r[key] as string).trim() || undefined : undefined);
    out.push({
      activity: str("activity") ?? "",
      status: str("status") ?? "1",
      municipality: str("municipality"),
      street: str("street"),
      isRoot: r.isRoot === true ? true : undefined,
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

  const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const activity = text("activity");
  const status = text("status") || "1";
  // Typed once and true for every slice, so it rides in the body rather than in
  // each of the few hundred slices going back and forth.
  const base: SearchBase = {
    name: text("name") || undefined,
    postalCode: text("postalCode") || undefined,
    town: text("town") || undefined,
  };

  // The area restriction: municipality names, already validated against the
  // official list by the resolve-area endpoint. Roots are then built per
  // municipality, so the run never queries outside the area at all.
  const municipalities = Array.isArray(body.municipalities)
    ? (body.municipalities as unknown[])
        .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
        .map((m) => m.trim())
        .slice(0, 250)
    : [];

  const queue = parseSlices(body.slices);
  if (queue.length === 0) {
    if (!activity && !base.name && !base.postalCode && !base.town && municipalities.length === 0) {
      return NextResponse.json(
        { error: "Vnesite vsaj en pogoj iskanja (SKD koda, ime, poštna številka, kraj ali območje)." },
        { status: 400 }
      );
    }
    queue.push(...rootSlices(activity, status, municipalities));
  }

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
          closed = true;
        }
      };

      // Bigger than the scrape route's budget because being cut off is cheap
      // here: rows are streamed as they are found and the client rebuilds the
      // queue from the last reported slice, so an over-run costs one query
      // rather than a batch. Tune with SEARCH_ALL_BUDGET_MS if the hosting plan
      // turns out to cap functions shorter than this.
      const budgetMs = Number(process.env.SEARCH_ALL_BUDGET_MS ?? 60_000);
      const pending: SearchSlice[] = [];
      const gaps: string[] = [];

      try {
        for (let i = 0; i < queue.length; i += 1) {
          const slice = queue[i];
          if (closed) break;

          if (Date.now() - startedAt > budgetMs) {
            pending.push(...queue.slice(i));
            break;
          }

          const label = sliceLabel(slice);
          send({ progress: { label, note: "iščem …", state: "start" } });

          try {
            const outcome = await runSlice(slice, base);
            // A root's total counts toward the run's expected grand total.
            // The explicit flag matters for area searches, which START at
            // municipality level; the old shape check stays for queues saved
            // by clients from before the flag existed.
            const isRoot = slice.isRoot === true || (!slice.municipality && !slice.street);

            // `index` and the child slices themselves go out with every result
            // so the client can rebuild the remaining queue on its own if the
            // stream dies before the closing `done` — otherwise a dropped
            // connection would quietly lose whole municipalities.
            send({
              slice: {
                label,
                index: i,
                rows: outcome.rows,
                total: outcome.total,
                isRoot,
                children: outcome.children,
              },
            });

            if (outcome.children.length > 0) {
              pending.push(...outcome.children);
              send({
                progress: {
                  label,
                  note: `${outcome.total?.toLocaleString("sl-SI") ?? "?"} zadetkov — razbijam na ${outcome.children.length} delov`,
                  state: "info",
                },
              });
            } else {
              send({
                progress: {
                  label,
                  note: `${outcome.rows.length} podjetij`,
                  state: outcome.rows.length > 0 ? "done" : "info",
                },
              });
            }

            if (outcome.gap) {
              gaps.push(outcome.gap);
              send({ progress: { label, note: outcome.gap, state: "error" } });
            }
          } catch (err) {
            // One bad query costs its slice, not the run. It goes back in the
            // queue so a transient block is retried rather than lost.
            const message = err instanceof Error ? err.message : "Neznana napaka.";
            send({ progress: { label, note: `napaka — ${message}`, state: "error" } });
            pending.push(slice);
          }
        }

        send({ done: { pending, gaps, ms: Date.now() - startedAt } });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Client already went away.
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
