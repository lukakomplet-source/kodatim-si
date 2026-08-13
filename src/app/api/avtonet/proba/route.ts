import { NextResponse } from "next/server";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Health probe for the avtonet database connection, from wherever this app is
 * running (locally that's localhost; on Vercel it exercises the tunnel).
 *
 * Exists because a failing avtonet DB is otherwise INVISIBLE: supabase-js
 * returns errors as values, the pages fall back to empty states, and "broken"
 * looks exactly like "no data yet". This endpoint states the truth: which host
 * it queried, whether the query worked, and the error text if it did not.
 * No auth needed — it exposes only a row count and an error string.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.AVTONET_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let vir = "";
  try {
    vir = new URL(url).hostname;
  } catch {
    vir = "NEVELJAVEN URL";
  }

  const zacetek = Date.now();
  try {
    const db = createAvtonetClient();
    const { count, error } = await db
      .from("avtonet_oglasi")
      .select("*", { count: "exact", head: true })
      .eq("status", "aktiven");
    return NextResponse.json({
      vir,
      ms: Date.now() - zacetek,
      aktivnihOglasov: count,
      napaka: error ? `${error.code ?? ""} ${error.message}`.trim() : null,
    });
  } catch (err) {
    return NextResponse.json({
      vir,
      ms: Date.now() - zacetek,
      aktivnihOglasov: null,
      napaka: `THROW: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
