import "server-only";
import { isListmonkConfigured, ListmonkUnreachableError, sendViaListmonk } from "./listmonk";
import { isResendConfigured, sendViaResend, type SendEmailResult } from "./resend";

/**
 * The one place KodaTim sends email from.
 *
 * Every caller imports `sendEmail` from here and stays unchanged; this module
 * decides the transport:
 *
 *   Listmonk configured   →  KodaTim → Listmonk /api/tx → (Listmonk's SMTP) → recipient
 *   otherwise             →  KodaTim → Resend REST → recipient   (fallback)
 *
 * Two things this arrangement buys, both deliberate:
 *
 *  1. A half-finished Listmonk setup never takes production email offline. Set
 *     the LISTMONK_* env vars and the transport flips over on the next request;
 *     unset them and it falls straight back to Resend. No deploy, no code change.
 *
 *  2. KodaTim is not tied to Resend. Which SMTP relay actually delivers the mail
 *     is configured INSIDE Listmonk (Settings → SMTP), not here — so moving off
 *     Resend to another relay, or to a self-hosted one, is a Listmonk setting,
 *     invisible to this code. The Resend branch below is only the pre-Listmonk
 *     fallback and can be deleted once Listmonk is proven in production.
 */

export type EmailTransport = "listmonk" | "resend" | "none";

export function activeEmailTransport(): EmailTransport {
  if (isListmonkConfigured()) return "listmonk";
  if (isResendConfigured()) return "resend";
  return "none";
}

export function isEmailProviderConfigured(): boolean {
  return activeEmailTransport() !== "none";
}

export type { SendEmailResult };

/**
 * Sends one email through the active transport.
 *
 * Signature is unchanged from the old direct-Resend helper, so callers did not
 * have to change. `data`/`templateId` are optional and only reach Listmonk —
 * they let a purpose-built transactional template pull structured fields; the
 * Resend fallback ignores them and sends the HTML as-is.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  data?: Record<string, unknown>;
  templateId?: number;
}): Promise<SendEmailResult> {
  const transport = activeEmailTransport();

  // Structured logs, no secrets — the token and API key never appear here.
  const started = Date.now();
  console.info(`[email] start transport=${transport} to=${redact(params.to)} subject=${JSON.stringify(params.subject.slice(0, 60))}`);

  try {
    let result: SendEmailResult;
    if (transport === "listmonk") {
      try {
        result = await sendViaListmonk({
          to: params.to,
          subject: params.subject,
          html: params.html,
          data: params.data,
          templateId: params.templateId,
        });
      } catch (err) {
        // The ONE safe fallback: Listmonk was provably never reached (PC/tunnel
        // down), so no message could have been queued there. Resend then still
        // delivers. Every other failure — a timeout (ambiguous), a 4xx/500
        // (Listmonk reached) — is NOT caught here, so it can never cause a
        // duplicate send. Needs Resend to still be configured as the net.
        if (err instanceof ListmonkUnreachableError && isResendConfigured()) {
          console.warn(
            `[email] listmonk nedosegljiv, padec na resend to=${redact(params.to)} razlog=${err.message}`
          );
          const r = await sendViaResend({
            to: params.to,
            subject: params.subject,
            html: params.html,
            replyTo: params.replyTo,
          });
          console.info(`[email] ok transport=resend(fallback) to=${redact(params.to)} ms=${Date.now() - started}`);
          return r;
        }
        throw err;
      }
    } else if (transport === "resend") {
      result = await sendViaResend({
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
      });
    } else {
      throw new Error(
        "Pošiljanje e-pošte še ni nastavljeno. Nastavite Listmonk (LISTMONK_URL, LISTMONK_API_USER, LISTMONK_API_TOKEN, LISTMONK_TX_TEMPLATE_ID) ali Resend (RESEND_API_KEY, RESEND_FROM_EMAIL)."
      );
    }
    console.info(`[email] ok transport=${transport} to=${redact(params.to)} ms=${Date.now() - started}`);
    return result;
  } catch (err) {
    console.error(
      `[email] failed transport=${transport} to=${redact(params.to)} ms=${Date.now() - started} error=${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

/** Keeps the recipient out of plain-text logs: marko@example.com → m***@example.com. */
function redact(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
