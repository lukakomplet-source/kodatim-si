import "server-only";

/**
 * Listmonk transactional email transport.
 *
 * Listmonk is the management layer (templates, logs, subscribers, bounces); the
 * actual delivery happens through whatever SMTP Listmonk is pointed at — here,
 * Resend's SMTP (smtp.resend.com). So the path is:
 *
 *   KodaTim server → Listmonk /api/tx → Listmonk → Resend SMTP → recipient
 *
 * This file only speaks to Listmonk's documented transactional endpoint
 * (https://listmonk.app/docs/apis/transactional/). It never touches Resend
 * directly — that is the whole point of the migration.
 *
 * A note on how the HTML gets through. Listmonk's /api/tx renders a TEMPLATE
 * with the `data` you send; there is no "raw body" field. Since KodaTim already
 * authors full HTML (e.g. campaign step bodies), we send that HTML as
 * `data.content` and rely on a one-time "passthrough" template in Listmonk that
 * emits it. The exact template text is in docs/listmonk-email-setup.md, and the
 * Listmonk SMTP test is what confirms it renders unescaped — a step that lives
 * on the Listmonk side and cannot be verified from here.
 */

export type ListmonkSendParams = {
  to: string;
  subject: string;
  html: string;
  /**
   * Extra structured fields for the template (`{{ .Tx.Data.<key> }}`). Used by
   * purpose-built templates; the generic passthrough ignores everything but
   * `content` and `subject`.
   */
  data?: Record<string, unknown>;
  /** Override the passthrough template with a purpose-built transactional one. */
  templateId?: number;
};

export type ListmonkConfig = {
  url: string;
  user: string;
  token: string;
  txTemplateId: number;
};

/** Reads and validates Listmonk env, or returns null when it isn't set up. */
export function listmonkConfig(): ListmonkConfig | null {
  const url = process.env.LISTMONK_URL?.trim().replace(/\/+$/, "");
  const user = process.env.LISTMONK_API_USER?.trim();
  const token = process.env.LISTMONK_API_TOKEN?.trim();
  const txTemplateId = Number(process.env.LISTMONK_TX_TEMPLATE_ID);

  if (!url || !user || !token || !Number.isInteger(txTemplateId) || txTemplateId <= 0) {
    return null;
  }
  return { url, user, token, txTemplateId };
}

export function isListmonkConfigured(): boolean {
  return listmonkConfig() !== null;
}

const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

/** HTTP statuses where the gateway explicitly did NOT process the message. */
const RETRY_STATUS = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sends one transactional email through Listmonk.
 *
 * Retry policy is deliberately narrow, because a careless retry is how a
 * recipient gets the same mail twice:
 *   - 502/503/504 or a pre-response network failure → the message did not get
 *     in, so retrying is safe. Up to 3 attempts with backoff.
 *   - a TIMEOUT after the body was sent → we cannot know whether Listmonk
 *     accepted it, so we do NOT retry; we fail and log, and let the caller's
 *     own status tracking (e.g. promo_email_sends) decide, rather than risk a
 *     duplicate.
 *   - 4xx → permanent (bad template id, auth, unverified sender). Fail at once.
 */
export async function sendViaListmonk(params: ListmonkSendParams): Promise<{ id: string }> {
  const cfg = listmonkConfig();
  if (!cfg) {
    throw new Error("Listmonk ni nastavljen (manjkajo LISTMONK_URL / LISTMONK_API_USER / LISTMONK_API_TOKEN / LISTMONK_TX_TEMPLATE_ID).");
  }

  const auth = Buffer.from(`${cfg.user}:${cfg.token}`, "utf8").toString("base64");
  const body = JSON.stringify({
    subscriber_email: params.to,
    template_id: params.templateId ?? cfg.txTemplateId,
    subject: params.subject,
    // The passthrough template reads `content` and `subject`; purpose-built
    // templates read whatever extra keys the caller passed.
    data: { subject: params.subject, content: params.html, ...(params.data ?? {}) },
    content_type: "html",
  });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let timedOut = false;
    controller.signal.addEventListener("abort", () => {
      timedOut = true;
    });

    try {
      const res = await fetch(`${cfg.url}/api/tx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Never logged. Basic auth over HTTPS is what Listmonk documents.
          Authorization: `Basic ${auth}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        // Listmonk answers {"data": true}; there is no per-message id, so we
        // return a marker the caller can store in a provider_message_id column.
        return { id: `listmonk-${Date.now()}` };
      }

      const text = (await res.text().catch(() => "")).slice(0, 300);
      if (RETRY_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastErr = new Error(`Listmonk ${res.status}: ${text}`);
        await sleep(500 * attempt);
        continue;
      }
      throw new Error(`Listmonk zavrnil (${res.status}): ${text}`);
    } catch (err) {
      clearTimeout(timer);
      // A timeout after sending the body is ambiguous — do not resend.
      if (timedOut) {
        throw new Error(
          `Listmonk se ni odzval v ${TIMEOUT_MS / 1000} s — sporočilo je morda bilo sprejeto, zato ga ne pošiljam znova.`
        );
      }
      // A pre-response network failure (DNS, refused, reset) means it did not
      // land — safe to retry.
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Listmonk: pošiljanje ni uspelo.");
}
