import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Can this server actually edit the code — and is it allowed to be asked from
 * outside?
 *
 * The editor used to be gated on "must be localhost, must not be production".
 * That was the right rule for the wrong reason: what it was really testing was
 * whether the process has a writable checkout and a toolchain, because a Vercel
 * function has neither. Since SBN Auto moved onto the user's own machine (next
 * start behind a Cloudflare tunnel) both are present, and the host check only
 * stopped the person who owns the machine from using it from their phone.
 *
 * So the capability is now MEASURED instead of guessed. And because the endpoint
 * is reachable from the internet the moment the host check is gone, a second
 * factor replaces it: a PIN that lives only in the environment. A stolen session
 * cookie is then not enough to rewrite the source — you also need the secret
 * that never travels with the login.
 *
 * Without AVTONET_AI_PIN set, remote editing stays off. That default is
 * deliberate: an accidental deployment of this code somewhere else must not
 * expose an edit endpoint just because it happens to have a checkout.
 */

export type Zmoznost = {
  /** True when an edit could actually be attempted from this request. */
  zmore: boolean;
  /** Why not, in Slovene, for the UI. */
  razlog: string | null;
  /** A PIN is configured, so the field should be shown. */
  pinNastavljen: boolean;
};

export const RAZLOG_BREZ_PIN =
  "Urejanje na daljavo je izklopljeno. V .env.local dodaj AVTONET_AI_PIN (poljubno geslo) " +
  "in znova zaženi stran — brez te skrivnosti bi za spreminjanje kode zadostoval ukraden piškotek seje.";

export const RAZLOG_BREZ_ODKLOPA =
  "Ta strežnik ne more urejati kode: nima zapisljivega odklopa repozitorija ali orodij za build. " +
  "Stran mora teči iz mape projekta (npm run build && npm start ali npm run dev).";

/** One shared lock: two builds in the same checkout would fight over the files. */
let tece = false;

export function zasedeno(): boolean {
  return tece;
}

export function zakleni(): boolean {
  if (tece) return false;
  tece = true;
  return true;
}

export function odkleni(): void {
  tece = false;
}

/**
 * Wrong PINs, counted per process.
 *
 * Not a full rate limiter and not pretending to be: it is the cheap half that
 * matters, turning an endpoint anyone could grind at into one that stops
 * answering after five wrong tries until the process restarts.
 */
let napacnih = 0;
const NAJVEC_NAPACNIH = 5;

export function pinPravilen(vnos: string | undefined): { ok: boolean; razlog?: string } {
  const pravi = process.env.AVTONET_AI_PIN;
  if (!pravi) return { ok: false, razlog: RAZLOG_BREZ_PIN };
  if (napacnih >= NAJVEC_NAPACNIH) {
    return {
      ok: false,
      razlog: "Preveč napačnih vnosov gesla. Znova zaženi stran, da se števec ponastavi.",
    };
  }
  // Constant-time comparison, so the answer does not leak the secret one
  // character at a time. Equal length is a precondition of timingSafeEqual, and
  // a differing length is already a mismatch.
  const vnosCist = (vnos ?? "").trim();
  const a = Buffer.from(vnosCist, "utf8");
  const b = Buffer.from(pravi, "utf8");
  const enako = a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  if (!enako) {
    napacnih += 1;
    return { ok: false, razlog: "Napačno geslo za urejanje." };
  }
  napacnih = 0;
  return { ok: true };
}

/** Probes the filesystem rather than trusting an env variable. */
export async function preveriZmoznost(): Promise<Zmoznost> {
  const pinNastavljen = Boolean(process.env.AVTONET_AI_PIN);

  try {
    const [{ execFile }, fs, { promisify }, { join }] = await Promise.all([
      import("node:child_process"),
      import("node:fs/promises"),
      import("node:util"),
      import("node:path"),
    ]);
    const izvedi = promisify(execFile);

    // A git checkout: without it the editor cannot list files or be reverted.
    await izvedi("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), windowsHide: true });

    // Actually writable, not merely present.
    const poskus = join(process.cwd(), ".next", "ai-urejanje-preizkus");
    await fs.mkdir(join(process.cwd(), ".next"), { recursive: true });
    await fs.writeFile(poskus, "ok", "utf8");
    await fs.rm(poskus, { force: true });

    if (!pinNastavljen) return { zmore: false, razlog: RAZLOG_BREZ_PIN, pinNastavljen };
    return { zmore: true, razlog: null, pinNastavljen };
  } catch {
    return { zmore: false, razlog: RAZLOG_BREZ_ODKLOPA, pinNastavljen };
  }
}
