import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { coachAnswer } from "@/lib/salesCoach";

/** One question to the sales coach, answered from the user's own knowledge base. */

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Vnesite vprašanje." }, { status: 400 });

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : null;
  const context = typeof body.context === "string" ? body.context : null;
  const cardone = body.cardone === true;

  const admin = createAdminClient();

  try {
    const { data: settings } = await admin
      .from("sales_coach_settings")
      .select("style")
      .eq("user_id", user.id)
      .maybeSingle();

    const result = await coachAnswer(admin, question, {
      style: (settings as { style?: string } | null)?.style ?? null,
      context,
      cardone,
    });

    // The conversation is kept so a campaign's brainstorm can be reopened later.
    await admin.from("sales_chat_messages").insert([
      { campaign_id: campaignId, role: "user", content: question, created_by: user.id },
      {
        campaign_id: campaignId,
        role: "assistant",
        content: result.answer,
        used_knowledge_ids: result.used.map((u) => u.id),
        created_by: user.id,
      },
    ]);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Coach ni mogel odgovoriti." },
      { status: 500 }
    );
  }
}
