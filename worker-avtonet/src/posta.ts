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
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, ...sporocilo }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) uspelo += 1;
      else log("warn", "posiljanje ni uspelo", { vrsta, status: res.status, za: sporocilo.to });
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
