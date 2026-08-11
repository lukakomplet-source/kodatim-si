/**
 * The base URL to put in an email that leaves the building.
 *
 * An invitation is always for someone else, on another machine, so a link to
 * `localhost` can never be right — it resolves to the recipient's own computer
 * and dies with ERR_CONNECTION_REFUSED. That happened: an invited user received
 * `http://localhost:3000/#access_token=…` and could not get in.
 *
 * `NEXT_PUBLIC_SITE_URL` is the correct source in production, but it is
 * deliberately `http://localhost:3000` in local development so that signing in
 * while developing works. Since invites are routinely sent from the local app,
 * this helper refuses any localhost value and falls back to the public site.
 *
 * Note for whoever changes this later: Supabase also validates `redirectTo`
 * against its own allow-list (Authentication → URL Configuration). If the URL is
 * not listed there, Supabase silently ignores it and uses its Site URL instead —
 * so this helper alone is not enough; the dashboard has to agree.
 */

const PRIVZETI_JAVNI = "https://www.kodatim.si";

function jeJaven(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return !["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Public base URL without a trailing slash. */
export function javniNaslov(): string {
  const kandidati = [
    process.env.NEXT_PUBLIC_PUBLIC_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ];

  const izbran = kandidati.find(jeJaven) ?? PRIVZETI_JAVNI;
  return izbran.replace(/\/+$/, "");
}

/** Where an invited person should land after accepting. */
export function povezavaZaVabilo(next: string): string {
  return `${javniNaslov()}/auth/callback?next=${encodeURIComponent(next)}`;
}
