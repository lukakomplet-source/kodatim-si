import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Where a screen's in-progress work is kept between visits.
 *
 * Stored per user rather than in the browser, because the point is to start
 * something on a phone and carry on at a desk. Nothing here is ever cleared on
 * its own — only an explicit DELETE, i.e. the user pressing "Počisti".
 */

export const runtime = "nodejs";

/** jsonb will take more, but a screen's state that large is a bug, not a save. */
const MAX_BYTES = 2_000_000;

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Manjka ključ." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ui_state")
    .select("value, updated_at")
    .eq("user_id", user.id)
    .eq("key", key)
    .maybeSingle();

  // A missing table (migration not run yet) is not an error worth breaking a
  // screen over — the screen simply starts empty.
  if (error) return NextResponse.json({ value: null, unavailable: true });

  return NextResponse.json({ value: data?.value ?? null, updatedAt: data?.updated_at ?? null });
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let body: { key?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : "";
  if (!key) return NextResponse.json({ error: "Manjka ključ." }, { status: 400 });
  if (body.value === undefined) return NextResponse.json({ error: "Manjka vrednost." }, { status: 400 });

  const serialised = JSON.stringify(body.value);
  if (serialised.length > MAX_BYTES) {
    return NextResponse.json({ error: "Stanje je preveliko za shranjevanje." }, { status: 413 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ui_state")
    .upsert({ user_id: user.id, key, value: body.value, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message, unavailable: true }, { status: 200 });
  return NextResponse.json({ saved: true });
}

export async function DELETE(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Manjka ključ." }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("ui_state").delete().eq("user_id", user.id).eq("key", key);
  return NextResponse.json({ cleared: true });
}
