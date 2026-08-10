import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What the dashboard polls while a research runs.
 *
 * The progress lives in one Supabase row that the worker updates as it goes, so
 * "live" needs no socket and no push channel: reading the row is reading the
 * truth. If the worker dies mid-sweep the row simply stops changing, and a
 * stalled timestamp is a more honest signal than a progress bar that keeps
 * animating.
 *
 * Admin-only, because /avtonet itself is a public demo page. Telling the panel
 * who is looking is what lets the page stay cacheable — it never has to read
 * cookies itself.
 *
 * A visitor gets 200 with `jeAdmin: false` rather than a 403. The response
 * carries nothing either way, and this is a page shown to clients: a red 403 in
 * their console would look like a broken demo, when in fact nothing failed.
 */

export const dynamic = "force-dynamic";

const POLJA =
  "id, status, faza, zahtevano_ob, zacetek, konec, strani_pregledanih, oglasov_najdenih, novih, posodobljenih, spremembe_cen, izginulih, detajlov_obdelanih, detajlov_skupaj, napak, zadnja_stran, zadnja_napaka, pregled_popoln, updated_at";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ jeAdmin: false, aktivna: null, zgodovina: [] });
  }

  const db = createAdminClient();

  const [aktivnaRes, zgodovinaRes] = await Promise.all([
    db
      .from("avtonet_raziskave")
      .select(POLJA)
      .in("status", ["zahtevano", "tece"])
      .order("zahtevano_ob", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("avtonet_raziskave")
      .select(POLJA)
      .in("status", ["koncano", "napaka", "preklicano"])
      .order("zahtevano_ob", { ascending: false })
      .limit(10),
  ]);

  if (aktivnaRes.error?.code === "PGRST205") {
    return NextResponse.json({
      jeAdmin: true,
      migracijaManjka: true,
      aktivna: null,
      zgodovina: [],
    });
  }

  return NextResponse.json({
    jeAdmin: true,
    aktivna: aktivnaRes.data ?? null,
    zgodovina: zgodovinaRes.data ?? [],
  });
}
