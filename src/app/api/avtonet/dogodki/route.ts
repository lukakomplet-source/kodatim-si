import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * The research console's feed: events the worker actually wrote.
 *
 * Incremental by design. The client sends the highest id it already has and
 * gets only what came after, so an open console does not re-download a log that
 * grows to tens of thousands of lines during a full sweep.
 *
 * There is no synthetic progress here. If the worker is not running, no new
 * events arrive and the console stops moving — which is precisely the signal a
 * person watching it needs.
 */

export const dynamic = "force-dynamic";

const NAJVEC = 300;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ jeAdmin: false, dogodki: [] }, { status: 200 });
  }

  const url = new URL(request.url);
  const raziskavaId = url.searchParams.get("raziskava");
  const po = Number(url.searchParams.get("po") ?? 0);

  const db = createAvtonetClient();

  // Without a research id, follow the most recent one — that is what "live"
  // means when you open the page while something is already running.
  let id = raziskavaId;
  if (!id) {
    const { data } = await db
      .from("avtonet_raziskave")
      .select("id")
      .order("zahtevano_ob", { ascending: false })
      .limit(1)
      .maybeSingle();
    id = (data as { id: string } | null)?.id ?? null;
  }

  if (!id) return NextResponse.json({ jeAdmin: true, raziskava: null, dogodki: [] });

  let q = db
    .from("avtonet_dogodki")
    .select("id, ob, vrsta, sporocilo")
    .eq("raziskava_id", id)
    .order("id", { ascending: true })
    .limit(NAJVEC);

  if (Number.isFinite(po) && po > 0) {
    q = q.gt("id", po);
  } else {
    // First load: the tail, not the head. Opening a console mid-sweep should
    // show what is happening now, not page 1 from three hours ago.
    q = db
      .from("avtonet_dogodki")
      .select("id, ob, vrsta, sporocilo")
      .eq("raziskava_id", id)
      .order("id", { ascending: false })
      .limit(NAJVEC);
  }

  const { data, error } = await q;

  if (error?.code === "PGRST205") {
    return NextResponse.json({
      jeAdmin: true,
      raziskava: id,
      migracijaManjka: true,
      dogodki: [],
    });
  }
  if (error) {
    return NextResponse.json({ jeAdmin: true, raziskava: id, napaka: error.message, dogodki: [] });
  }

  const vrstice = data ?? [];
  const dogodki = po > 0 ? vrstice : [...vrstice].reverse();

  return NextResponse.json({ jeAdmin: true, raziskava: id, dogodki });
}
