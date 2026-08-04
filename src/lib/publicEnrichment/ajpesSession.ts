import "server-only";
import { providerFetch } from "./httpClient";

const BASE = "https://www.ajpes.si";
const LOGIN_URL = `${BASE}/MDScripts/ajax.asp?method=checkuser`;
const LOGIN_REQUIRED_MARKER = "obvezna prijava";

export type AjpesSession = { cookie: string };

function extractCookieHeader(response: Response): string {
  // Node's fetch exposes multiple Set-Cookie values via getSetCookie(); each
  // one only needs its name=value pair forwarded, not the cookie's own attrs.
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie") as string] : []);
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function login(): Promise<AjpesSession | null> {
  const username = process.env.AJPES_USERNAME;
  const password = process.env.AJPES_PASSWORD;
  if (!username || !password) return null;

  const body = new URLSearchParams({ uporabnik: username, geslo: password, avto: "0" });
  const response = await providerFetch("ajpes", LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) throw new Error(`AJPES prijava ni uspela (${response.status}).`);
  const cookie = extractCookieHeader(response);
  if (!cookie) throw new Error("AJPES prijava ni vrnila seje (piškotka).");
  return { cookie };
}

/**
 * One session for the whole process, and only ever one login in flight.
 *
 * Every call used to log in from scratch. Scraping several companies at once
 * therefore fired several logins at the same account simultaneously, AJPES
 * invalidated the earlier cookies, and the losing requests came back as the
 * login wall instead of the company page — which parsed to literally one field
 * (a hardcoded constant) and showed up as an empty row in Lead skrejp.
 */
let sharedSession: AjpesSession | null = null;
let loginInFlight: Promise<AjpesSession | null> | null = null;

async function getSession(forceNew: boolean): Promise<AjpesSession | null> {
  if (!forceNew && sharedSession) return sharedSession;

  // Concurrent callers join the login that is already running instead of
  // starting competing ones.
  if (!loginInFlight) {
    loginInFlight = login()
      .then((session) => {
        sharedSession = session;
        return session;
      })
      .finally(() => {
        loginInFlight = null;
      });
  }
  return loginInFlight;
}

/** Drops the cached session — used by tests and after a hard auth failure. */
export function resetAjpesSession(): void {
  sharedSession = null;
}

/**
 * AJPES keeps per-session state on the server: opening a company "selects" it
 * (that is what powers its own "Zadnji vpogledi" list), and the richer PRS view
 * is only served for the currently selected one. Two companies read in parallel
 * over one session therefore overwrite each other's selection, and the loser
 * gets a 4.7 kB stub with none of the labels on it.
 *
 * There is one account, so there is one session, so AJPES reads have to be
 * serialised. Everything else (CompanyWall, Bizi, the website) still runs
 * concurrently — this lock only covers the select-then-read pair.
 */
let ajpesQueue: Promise<unknown> = Promise.resolve();

export function withAjpesLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = ajpesQueue.then(fn, fn);
  // Keep the chain alive even when a caller rejects, or one failure would
  // permanently block every company behind it.
  ajpesQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Fetches an AJPES page with the given session cookie. If the response
 * indicates the session isn't authenticated (login wall text), logs in once
 * more and retries — covers both "credentials were never tried yet" and
 * "session expired mid-run".
 */
export async function fetchAjpesAuthed(
  url: string,
  session: AjpesSession | null
): Promise<{ html: string; session: AjpesSession; status: number }> {
  let current = session ?? (await getSession(false));
  if (!current) throw new Error("AJPES: poverilnice niso nastavljene.");

  let response = await providerFetch("ajpes", url, { headers: { Cookie: current.cookie } });
  let html = await response.text();

  if (html.includes(LOGIN_REQUIRED_MARKER)) {
    // The session expired, or another process took it over. Force one fresh
    // login — concurrent callers hitting this at the same moment share it.
    const relogin = await getSession(true);
    if (!relogin) throw new Error("AJPES: poverilnice niso nastavljene.");
    current = relogin;
    response = await providerFetch("ajpes", url, { headers: { Cookie: current.cookie } });
    html = await response.text();
    if (html.includes(LOGIN_REQUIRED_MARKER)) {
      throw new Error("AJPES: prijava ni uspela (napačni podatki ali sprememba prijavnega postopka).");
    }
  }

  return { html, session: current, status: response.status };
}

export { login as loginAjpes };
