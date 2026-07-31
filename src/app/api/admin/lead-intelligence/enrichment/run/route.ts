import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { runLeadEnrichment } from "@/lib/enrichment/orchestrator";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let leadId: string | undefined;
  try {
    const body = await request.json();
    leadId = typeof body?.leadId === "string" ? body.leadId : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!leadId) return NextResponse.json({ error: "Manjka lead." }, { status: 400 });

  const admin = createAdminClient();
  const result = await runLeadEnrichment(leadId, admin, user.id);

  return NextResponse.json(result);
}
