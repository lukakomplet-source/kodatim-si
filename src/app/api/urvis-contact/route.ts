import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

/**
 * Contact form for the /urvis demo. Recipient is KodaTim's own inbox, not the
 * real client's — this is a preview page, not the live urvis.si site.
 */
const URVIS_DEMO_RECIPIENT = "info@kodatim.si";

export async function POST(request: NextRequest) {
  let body: { name?: unknown; email?: unknown; phone?: unknown; company?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Izpolnite ime, email in sporočilo." }, { status: 400 });
  }

  const html = `
    <p><strong>Povpraševanje z demo strani /urvis</strong></p>
    <p>Ime: ${name}</p>
    <p>Email: ${email}</p>
    ${phone ? `<p>Telefon: ${phone}</p>` : ""}
    ${company ? `<p>Podjetje: ${company}</p>` : ""}
    <p>Sporočilo:</p>
    <p>${message.replace(/\n/g, "<br />")}</p>
  `;

  try {
    await sendEmail({
      to: URVIS_DEMO_RECIPIENT,
      subject: `[urvis demo] Povpraševanje od ${name}`,
      html,
      replyTo: email,
    });
  } catch (err) {
    console.error("Napaka pri pošiljanju urvis demo povpraševanja:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pošiljanja trenutno ni mogoče izvesti." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
