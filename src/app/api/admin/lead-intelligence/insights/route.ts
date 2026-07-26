import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";

export async function POST() {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  const { data: stats, error } = await supabase.rpc(
    "intel_leads_dashboard_stats"
  );

  if (error || !stats) {
    return NextResponse.json(
      { error: "Statistik ni bilo mogoče naložiti." },
      { status: 500 }
    );
  }

  if (!stats.total) {
    return NextResponse.json({
      summary: "Baza je še prazna — najprej uvozite leade.",
    });
  }

  try {
    const result = await chatJSON<{ summary: string }>(
      'Si prodajni analitik za slovensko IT razvojno agencijo. Na podlagi statistik baze potencialnih strank napiši kratek (3-5 povedi), konkreten predlog v slovenščini, katere skupine leadov obravnavati najprej in zakaj. Bodi specifičen (omeni panoge/mesta iz podatkov), ne izmišljuj si podatkov, ki jih nimaš. Odgovori IZKLJUČNO z JSON objektom {"summary": "..."}.',
      JSON.stringify(stats),
      { temperature: 0.4 }
    );
    return NextResponse.json({ summary: result.summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka pri AI klicu." },
      { status: 502 }
    );
  }
}
