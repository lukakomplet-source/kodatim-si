import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMPORT_FIELDS, type ImportField } from "@/lib/lead-intelligence/types";

type ImportRow = Partial<Record<ImportField, string>>;

const SOURCES = ["csv", "xlsx", "xls", "manual"] as const;

function clean(row: ImportRow): ImportRow {
  const out: ImportRow = {};
  for (const field of IMPORT_FIELDS) {
    const v = row[field];
    if (typeof v === "string" && v.trim()) out[field] = v.trim().slice(0, 2000);
  }
  return out;
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

  let body: {
    importId?: string;
    filename?: string;
    source?: string;
    rows?: ImportRow[];
    isFirstChunk?: boolean;
    isLastChunk?: boolean;
    totalRows?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const rows = (Array.isArray(body.rows) ? body.rows : []).map(clean).filter(
    (r) => r.company_name
  );
  const source = SOURCES.includes(body.source as (typeof SOURCES)[number])
    ? (body.source as (typeof SOURCES)[number])
    : "manual";

  const admin = createAdminClient();

  let importId = body.importId;
  if (body.isFirstChunk || !importId) {
    const { data, error } = await admin
      .from("intel_imports")
      .insert({
        filename: body.filename ?? null,
        source,
        row_count: body.totalRows ?? rows.length,
        status: "processing",
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Uvoza ni bilo mogoče začeti." }, { status: 500 });
    }
    importId = data.id;
  }

  let inserted = 0;
  let skipped = 0;

  if (rows.length > 0) {
    const emails = rows.map((r) => r.email?.toLowerCase()).filter(Boolean) as string[];
    const websites = rows.map((r) => r.website?.toLowerCase()).filter(Boolean) as string[];
    const vatIds = rows.map((r) => r.vat_id?.toLowerCase()).filter(Boolean) as string[];

    const existing = new Set<string>();
    if (emails.length || websites.length || vatIds.length) {
      const orParts: string[] = [];
      if (emails.length) orParts.push(`email.in.(${emails.map((e) => `"${e}"`).join(",")})`);
      if (websites.length) orParts.push(`website.in.(${websites.map((w) => `"${w}"`).join(",")})`);
      if (vatIds.length) orParts.push(`vat_id.in.(${vatIds.map((v) => `"${v}"`).join(",")})`);

      const { data: matches } = await admin
        .from("intel_leads")
        .select("email, website, vat_id")
        .or(orParts.join(","));

      for (const m of matches ?? []) {
        if (m.email) existing.add(`email:${String(m.email).toLowerCase()}`);
        if (m.website) existing.add(`website:${String(m.website).toLowerCase()}`);
        if (m.vat_id) existing.add(`vat:${String(m.vat_id).toLowerCase()}`);
      }
    }

    const toInsert = rows.filter((r) => {
      const keys = [
        r.email && `email:${r.email.toLowerCase()}`,
        r.website && `website:${r.website.toLowerCase()}`,
        r.vat_id && `vat:${r.vat_id.toLowerCase()}`,
      ].filter(Boolean) as string[];
      const isDuplicate = keys.some((k) => existing.has(k));
      if (isDuplicate) skipped += 1;
      return !isDuplicate;
    });

    if (toInsert.length > 0) {
      const { error } = await admin.from("intel_leads").insert(
        toInsert.map((r) => ({ ...r, import_id: importId, enrichment_status: "queued" }))
      );
      if (error) {
        return NextResponse.json({ error: "Vrstic ni bilo mogoče shraniti." }, { status: 500 });
      }
      inserted = toInsert.length;
    }
  }

  if (body.isLastChunk) {
    const { count: importedTotal } = await admin
      .from("intel_leads")
      .select("id", { count: "exact", head: true })
      .eq("import_id", importId);
    await admin
      .from("intel_imports")
      .update({
        status: "completed",
        imported_count: importedTotal ?? 0,
        skipped_count: Math.max(0, (body.totalRows ?? 0) - (importedTotal ?? 0)),
      })
      .eq("id", importId);
  }

  return NextResponse.json({ importId, inserted, skipped });
}
