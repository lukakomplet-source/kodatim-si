import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: NextRequest) {
  let body: { email?: unknown; phone?: unknown; messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!email && !phone) {
    return NextResponse.json(
      { error: "Vnesite vsaj email ali telefonsko številko." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !supabaseUrl.startsWith("http")) {
    console.error("Supabase ni nastavljen — glej .env.local in supabase/schema.sql.");
    return NextResponse.json(
      { error: "Shranjevanje kontaktov trenutno ni na voljo." },
      { status: 503 }
    );
  }

  const referralCode = request.cookies.get("kt_ref")?.value || null;

  try {
    const supabase = createAdminClient();

    let referralPartnerId: string | null = null;
    if (referralCode) {
      const { data: partner } = await supabase
        .from("profiles")
        .select("id")
        .eq("referral_code", referralCode)
        .eq("role", "partner")
        .maybeSingle();
      referralPartnerId = partner?.id ?? null;
    }

    const { error } = await supabase.from("leads").insert({
      email: email || null,
      phone: phone || null,
      messages: body.messages ?? [],
      referral_code: referralCode,
      referral_partner_id: referralPartnerId,
    });

    if (error) {
      console.error("Napaka pri shranjevanju leada v Supabase:", error);
      return NextResponse.json(
        { error: "Kontakta ni bilo mogoče shraniti. Poskusite znova." },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Napaka pri povezavi s Supabase:", err);
    return NextResponse.json(
      { error: "Kontakta ni bilo mogoče shraniti. Poskusite znova." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
