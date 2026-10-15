import type { Db } from "./db.js";

/**
 * Every outgoing email goes through here, and the day's count lives in the
 * database.
 *
 * Both halves matter. The count was previously a variable in this process
 * (`lastReportDay`), so a restart forgot that today's report had already gone
 * out — and on a day of debugging, with the worker restarted eight times, that
 * is eight identical reports. A quota that resets when the thing it limits
 * restarts is not a quota.
 *
 * And a cap, not just a de-duplicator: one mail a day is what a person actually
 * wants from a market watcher, two is the ceiling. Anything past it is dropped
 * and said out loud in the log, never queued for later — a report about
 * yesterday delivered tomorrow is worse than no report.
 */

export const MAX_NA_DAN = Number(process.env.AVTONET_MAX_MAILOV ?? 2);

type Stanje = {
  dan: string;
  poslanih: number;
  /** Which kinds already went out today, so a restart cannot repeat them. */
  vrste: string[];
  zadnji: string | null;
};

const PRAZNO: Stanje = { dan: "", poslanih: 0, vrste: [], zadnji: null };

function danes(): string {
  return new Date().toISOString().slice(0, 10);
}

async function preberi(db: Db): Promise<Stanje> {
  try {
    const { data } = await db
      .from("avtonet_statistika")
      .select("podatki")
      .eq("kljuc", "posta")
      .maybeSingle();
    const s = (data as { podatki: Stanje } | null)?.podatki;
    if (!s || s.dan !== danes()) return { ...PRAZNO, dan: danes() };
    return { ...PRAZNO, ...s };
  } catch {
    // Unreadable state must not become a reason to send more, so assume the
    // quota is spent rather than free.
    return { dan: danes(), poslanih: MAX_NA_DAN, vrste: [], zadnji: null };
  }
}

async function zapisi(db: Db, s: Stanje): Promise<void> {
  try {
    await db.from("avtonet_statistika").upsert({
      kljuc: "posta",
      podatki: s,
      izracunano: new Date().toISOString(),
    });
  } catch {
    // Best effort; a failed bookkeeping write must not block collecting.
  }
}

export type Izid = "poslano" | "kvota" | "ze_danes" | "ni_nastavljeno" | "napaka";

/**
 * Addresses whose mail goes to the team's Telegram group instead
 * (TELEGRAM_OBVESTILA_EMAILS, "naslov=Ime,..."; same list as Kompletko's app).
 */
function jeVEkipi(naslov: string): boolean {
  if (!process.env.TELEGRAM_OBVESTILA_TOKEN || !process.env.TELEGRAM_OBVESTILA_CHAT_ID) return false;
  const ekipa = (process.env.TELEGRAM_OBVESTILA_EMAILS ?? "")
    .split(",")
    .map((d) => d.split("=")[0]!.trim().toLowerCase())
    .filter(Boolean);
  return ekipa.includes(naslov.trim().toLowerCase());
}

function besediloIzHtml(html: string): string {
  return html
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|tr|h[1-6]|li|table)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " · ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&bdquo;|&ldquo;/g, '"')
    .split("\n")
    .map((v) => v.replace(/[ \t]+/g, " ").replace(/^(· )+|( ·)+$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

async function vTelegram(naslov: string, html: string): Promise<boolean> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = `<b>${esc(naslov)}</b>\n\n${esc(besediloIzHtml(html))}`.slice(0, 3900);
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_OBVESTILA_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_OBVESTILA_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends one email if today's budget allows it.
 *
 * @param vrsta  A stable name for the kind of mail ("dnevno", "spremljanja").
 *   One of each kind per day: the same kind asking twice is a restart, not news.
 */
export async function posljiEnkratNaDan(
  db: Db,
  vrsta: string,
  // One or more messages, but ONE budget item. Watch notifications are personal
  // — each person's cars must go only to them — yet from the reader's side that
  // is still a single mail in a single inbox, so it must not cost three.
  sporocila: { to: string[]; subject: string; html: string }[],
  log: (l: "info" | "warn" | "error", m: string, e?: Record<string, unknown>) => void
): Promise<Izid> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  const veljavna = sporocila.filter((s) => s.to.length > 0);
  if (!key || !from || veljavna.length === 0) return "ni_nastavljeno";

  const s = await preberi(db);

  if (s.vrste.includes(vrsta)) {
    log("info", "posta preskocena - ta vrsta je danes ze poslana", { vrsta });
    return "ze_danes";
  }
  if (s.poslanih >= MAX_NA_DAN) {
    log("warn", "posta preskocena - dnevna kvota porabljena", {
      vrsta,
      kvota: MAX_NA_DAN,
      poslanih: s.poslanih,
    });
    return "kvota";
  }

  try {
    let uspelo = 0;
    for (const sporocilo of veljavna) {
      // Luka wants these on Telegram, not in his inbox; SBN (Nik, Benjamin)
      // keep their mail. If Telegram fails, he gets the mail after all.
      const ekipa = sporocilo.to.filter(jeVEkipi);
      let ostali = sporocilo.to.filter((t) => !jeVEkipi(t));
      if (ekipa.length > 0) {
        if (await vTelegram(sporocilo.subject, sporocilo.html)) uspelo += 1;
        else ostali = sporocilo.to;
      }
      if (ostali.length === 0) continue;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, ...sporocilo, to: ostali }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) uspelo += 1;
      else log("warn", "posiljanje ni uspelo", { vrsta, status: res.status, za: ostali });
    }
    if (uspelo === 0) return "napaka";
    // Counted only on success, so a failed send does not eat the day's budget.
    await zapisi(db, {
      dan: danes(),
      poslanih: s.poslanih + 1,
      vrste: [...s.vrste, vrsta],
      zadnji: new Date().toISOString(),
    });
    log("info", "posta poslana", { vrsta, sporocil: uspelo });
    return "poslano";
  } catch (err) {
    log("warn", "posiljanje ni uspelo", {
      vrsta,
      napaka: err instanceof Error ? err.message : String(err),
    });
    return "napaka";
  }
}

/** For the console: how much of today's budget is left. */
export async function stanjePoste(db: Db): Promise<{ poslanih: number; kvota: number }> {
  const s = await preberi(db);
  return { poslanih: s.poslanih, kvota: MAX_NA_DAN };
}
