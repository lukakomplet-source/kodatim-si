import "server-only";

export type SendEmailResult = { id: string };

/**
 * Sends a single email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Throws a clear, actionable error if the provider isn't configured yet —
 * never silently pretends the email went out.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error(
      "Pošiljanje e-pošte še ni nastavljeno. Dodajte RESEND_API_KEY in RESEND_FROM_EMAIL v .env.local (prijavite se na resend.com, potrdite domeno za pošiljanje in ustvarite API ključ)."
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend napaka (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json();
  if (!json?.id) {
    throw new Error("Resend ni vrnil ID sporočila.");
  }

  return { id: json.id as string };
}

export function isEmailProviderConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
