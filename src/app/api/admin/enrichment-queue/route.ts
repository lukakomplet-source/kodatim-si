import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueCounts } from "@/lib/enrichment/queue";

/**
 * How much work is waiting for the background worker.
 *
 * Read-only and cheap (four counting queries), so the screen can poll it while
 * a run is in flight. Without this the queue is invisible: you push thousands
 * of companies into it and have no way to tell whether anything is happening
 * short of reading the worker's terminal.
 */

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    return NextResponse.json({ counts: await queueCounts(admin) });
  } catch (err) {
    // Most likely the migration has not been run yet — say so plainly rather
    // than showing zeros that look like an empty queue.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Vrste ni bilo mogoče prebrati." },
      { status: 500 }
    );
  }
}
