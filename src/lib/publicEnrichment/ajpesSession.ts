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
 * Fetches an AJPES page with the given session cookie. If the response
 * indicates the session isn't authenticated (login wall text), logs in once
 * more and retries — covers both "credentials were never tried yet" and
 * "session expired mid-run".
 */
export async function fetchAjpesAuthed(
  url: string,
  session: AjpesSession | null
): Promise<{ html: string; session: AjpesSession }> {
  let current = session ?? (await login());
  if (!current) throw new Error("AJPES: poverilnice niso nastavljene.");

  let response = await providerFetch("ajpes", url, { headers: { Cookie: current.cookie } });
  let html = await response.text();

  if (html.includes(LOGIN_REQUIRED_MARKER)) {
    const relogin = await login();
    if (!relogin) throw new Error("AJPES: poverilnice niso nastavljene.");
    current = relogin;
    response = await providerFetch("ajpes", url, { headers: { Cookie: current.cookie } });
    html = await response.text();
    if (html.includes(LOGIN_REQUIRED_MARKER)) {
      throw new Error("AJPES: prijava ni uspela (napačni podatki ali sprememba prijavnega postopka).");
    }
  }

  return { html, session: current };
}

export { login as loginAjpes };
