import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";

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

  const db = createAvtonetClient();

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

  // Cumulative totals over the whole database, not just this run.
  //
  // The research row counts what the CURRENT run has done, and recomputes how
  // many are still missing when it starts. After a restart that reads as "back
  // to zero" — 5,680 of 46,205 became 20 of 40,520 — even though the 13,000
  // already-captured adverts were correctly skipped. Reporting the standing
  // totals alongside makes the real progress visible and a restart obviously
  // harmless.
  const [aktivnihRes, zDetajliRes, urnikRes, prostorRes] = await Promise.all([
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }).eq("status", "aktiven"),
    db
      .from("avtonet_oglasi")
      .select("id", { count: "exact", head: true })
      .eq("status", "aktiven")
      .not("detajl_zajet", "is", null),
    db.from("avtonet_urnik").select("omogocen, ure").eq("id", 1).maybeSingle(),
    // Physical size of the avtonet DB — for the "zasedeno" gauge. Only the local
    // avtonet DB has this RPC; on the cloud fallback it simply comes back null.
    db.rpc("avtonet_db_size"),
  ]);

  const uporabljeno =
    !prostorRes.error && prostorRes.data != null ? Number(prostorRes.data) : null;
  const AVTONET_LIMIT_BYTES = Number(process.env.AVTONET_MAX_BYTES ?? 50 * 1024 * 1024 * 1024);

  return NextResponse.json({
    jeAdmin: true,
    aktivna: aktivnaRes.data ?? null,
    zgodovina: zgodovinaRes.data ?? [],
    skupno: {
      aktivnih: aktivnihRes.count ?? 0,
      zDetajli: zDetajliRes.count ?? 0,
    },
    // Absent table (migration not yet run) simply means no schedule to show.
    urnik: urnikRes.error ? null : (urnikRes.data ?? { omogocen: false, ure: "5,10,22" }),
    prostor: { uporabljeno, limit: AVTONET_LIMIT_BYTES },
  });
}
