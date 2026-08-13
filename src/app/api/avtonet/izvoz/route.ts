import { NextResponse, type NextRequest } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";

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

/** Columns that exist before migration_avtonet_detajl_v2.sql. */
const STOLPCI_OSNOVA = [
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
 * Everything, once the detail pass has somewhere to put it.
 *
 * The export exists to make the data usable outside the app, and without these
 * the file cannot answer the question the detail pass was added for — which
 * configuration sells fastest.
 */
const STOLPCI = [
  ...STOLPCI_OSNOVA,
  "verzija",
  "pogon",
  "pogonski_sklop",
  "notranjost",
  "stevilo_vrat",
  "stevilo_sedezev",
  "lastnikov",
  "leto_proizvodnje",
  "emisijski_razred",
  "co2_g_km",
  "poraba_l_100km",
  "oprema_znacilke",
  "oprema",
  "opis",
  "status_spremenjen",
  "detajl_zajet",
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
  const db = createAvtonetClient();

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

  // PostgREST caps a response at its own max-rows (1,000 by default) no matter
  // what `.limit()` asks for, so a single select silently truncated the export:
  // the "whole database" file arrived with exactly 1,000 of 53,717 adverts and
  // nothing said so. Paging with .range() is the only way to get past it.
  const STRAN = 1000;
  const vrstice: Record<string, unknown>[] = [];
  // Falls back to the pre-v2 column set if the migration has not been run, so
  // the export keeps working instead of returning a 500 nobody can interpret.
  let stolpci: readonly string[] = STOLPCI;

  for (let od = 0; od < 200_000; od += STRAN) {
    const beri = async () => {
      let q = db
        .from("avtonet_oglasi")
        .select(stolpci.join(", "))
        .order("first_seen", { ascending: false })
        .range(od, od + STRAN - 1);
      if (idji) q = q.in("id", idji);
      return q;
    };

    let { data, error } = await beri();
    if (error?.code === "42703" && stolpci !== STOLPCI_OSNOVA) {
      stolpci = STOLPCI_OSNOVA;
      ({ data, error } = await beri());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const kos = (data ?? []) as unknown as Record<string, unknown>[];
    vrstice.push(...kos);
    if (kos.length < STRAN) break;
  }
  const csv = [
    stolpci.join(";"),
    ...vrstice.map((v) => stolpci.map((s) => polje(v[s])).join(";")),
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
