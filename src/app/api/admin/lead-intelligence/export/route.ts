import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntelLead } from "@/lib/lead-intelligence/types";

const COLUMNS: (keyof IntelLead)[] = [
  "company_name",
  "industry",
  "website",
  "email",
  "phone",
  "address_street",
  "address_city",
  "address_region",
  "address_country",
  "vat_id",
  "contact_person",
  "notes",
  "lead_status",
  "priority",
  "reminder_date",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let ids: string[];
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === "string") : [];
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "Ni izbranih leadov." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intel_leads")
    .select(COLUMNS.join(","))
    .in("id", ids.slice(0, 20000));

  if (error || !data) {
    return NextResponse.json({ error: "Izvoz ni uspel." }, { status: 500 });
  }

  const rows = data as unknown as IntelLead[];
  const lines = [
    COLUMNS.join(","),
    ...rows.map((row) => COLUMNS.map((col) => csvEscape(row[col])).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leadi-export.csv"`,
    },
  });
}
