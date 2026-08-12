import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { activeEmailTransport, sendEmail } from "@/lib/email";

/**
 * Admin-only end-to-end email test.
 *
 * Sends one real message through whatever transport is active and reports which
 * one it was, so the full path can be proven from production:
 *
 *   POST /api/admin/email/test   { "to": "you@example.com" }
 *
 * Guarded by requireAdmin — a normal user (or an unauthenticated request) gets
 * 401 and cannot make the server send mail on their behalf.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let to: string | undefined;
  try {
    to = (await request.json())?.to;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Vnesite veljaven e-poštni naslov." }, { status: 400 });
  }

  const transport = activeEmailTransport();
  if (transport === "none") {
    return NextResponse.json(
      { error: "Noben e-poštni prenos ni nastavljen (ne Listmonk ne Resend)." },
      { status: 503 }
    );
  }

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#18181b;line-height:1.6">
      <h2 style="margin:0 0 12px">KodaTim — test e-pošte</h2>
      <p>Če vidiš to sporočilo, celotna pot deluje:</p>
      <p style="font-family:ui-monospace,monospace;background:#f4f4f5;padding:12px 14px;border-radius:8px">
        KodaTim → ${transport === "listmonk" ? "Listmonk → SMTP" : "Resend"} → tvoj predal
      </p>
      <p style="color:#71717a;font-size:13px">Aktivni prenos: <strong>${transport}</strong>. Poslano ${new Date().toLocaleString("sl-SI")}.</p>
    </div>`;

  try {
    const result = await sendEmail({
      to,
      subject: "KodaTim — test e-pošte",
      html,
      data: { test: true },
    });
    return NextResponse.json({ ok: true, transport, id: result.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pošiljanje ni uspelo.", transport },
      { status: 502 }
    );
  }
}
