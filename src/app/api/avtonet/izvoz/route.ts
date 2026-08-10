import { NextResponse, type NextRequest } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CSV export of collected adverts — the whole database, or just what one
 * research saw.
 *
 * CSV rather than a real .xlsx: Excel opens it natively and it costs no
 * dependency. Two details make the difference between a file that opens cleanly
 * in a Slovenian Excel and one that arrives as mojibake in a single column — a
 * UTF-8 byte-order mark, and the semicolon separator that Excel expects in
 * locales where the comma is the decimal mark. Both are here on purpose.
 */

export const dynamic = "force-dynamic";

const STOLPCI = [
  "avtonet_id",
  "naziv",
  "znamka",
  "model",
  "letnik",
  "km",
  "kw",
  "km_moci",
  "gorivo",
  "menjalnik",
  "karoserija",
  "barva",
  "cena_eur",
  "cena_prvotna_eur",
  "status",
  "prodajalec_naziv",
  "je_dealer",
  "lokacija",
  "first_seen",
  "last_seen",
  "url",
] as const;

/**
 * One CSV field.
 *
 * The leading-character guard is not cosmetic: a value starting with =, +, - or
 * @ is executed as a formula when the file is opened, so an advert title
 * beginning with one would run in the reader's spreadsheet. Prefixing a single
 * quote keeps it text.
 */
function polje(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) {
    return NextResponse.json({ error: "Nimate dovoljenja." }, { status: 403 });
  }

  const raziskava = new URL(request.url).searchParams.get("raziskava");
  const db = createAdminClient();

  let idji: string[] | null = null;
  if (raziskava) {
    // What this research actually saw, read from the snapshots it wrote.
    const { data } = await db
      .from("avtonet_posnetki")
      .select("oglas_id")
      .eq("raziskava_id", raziskava)
      .limit(50_000);
    idji = [...new Set(((data ?? []) as { oglas_id: string }[]).map((s) => s.oglas_id))];
    if (idji.length === 0) {
      return NextResponse.json(
        { error: "Ta raziskava nima povezanih oglasov (posnetki so bili zajeti pred to funkcijo)." },
        { status: 404 }
      );
    }
  }

  let q = db.from("avtonet_oglasi").select(STOLPCI.join(", ")).order("first_seen", { ascending: false });
  if (idji) q = q.in("id", idji);

  const { data, error } = await q.limit(50_000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vrstice = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [
    STOLPCI.join(";"),
    ...vrstice.map((v) => STOLPCI.map((s) => polje(v[s])).join(";")),
  ].join("\r\n");

  const ime = raziskava ? `sbn-auto-raziskava-${raziskava.slice(0, 8)}.csv` : "sbn-auto-baza.csv";

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ime}"`,
      "Cache-Control": "no-store",
    },
  });
}
