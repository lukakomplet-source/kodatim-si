/**
 * The fence around the AI editor.
 *
 * This is the security boundary of the whole feature, so it is a small, boring,
 * separately readable file rather than a few `if`s inside a route handler. The
 * editor may touch SBN Auto and nothing else: not the KodaTim admin, not other
 * demo sites, not configuration, not secrets, not CI.
 *
 * The rule is an allowlist, never a denylist. A denylist protects only the
 * things somebody remembered to name, and the cost of a miss here is the model
 * editing authentication or deleting a project.
 */

/** Prefixes the editor may write to. Everything else is refused. */
export const DOSEG: readonly string[] = [
  "src/app/(demo)/avtonet/",
  "src/app/api/avtonet/",
  "src/lib/avtonet/",
  "worker-avtonet/src/",
];

/**
 * Files the editor may create even though they sit outside a scoped folder.
 * Only avtonet migrations, and only as new files with this exact prefix.
 */
export const DOSEG_PREDPONE: readonly string[] = ["supabase/migration_avtonet"];

/** Extensions it may write. No JSON, so it cannot touch package.json or configs. */
export const DOVOLJENE_KONCNICE: readonly string[] = [".ts", ".tsx", ".sql", ".css", ".md"];

/**
 * Paths that are refused even inside the scope, because editing them changes
 * the fence itself or the gate in front of it.
 */
export const PREPOVEDANO: readonly string[] = [
  "src/lib/avtonet/aiScope.ts",
  "src/app/api/avtonet/ai-urejanje/route.ts",
];

export type Presoja = { velja: true; pot: string } | { velja: false; razlog: string };

/**
 * Normalises a model-supplied path and decides whether it is in scope.
 *
 * Traversal is rejected rather than resolved: a path containing `..` has no
 * legitimate reason to appear in a generated edit, and treating it as an error
 * is safer than normalising it and hoping the result still lands inside the
 * fence.
 */
export function presodiPot(vhod: string): Presoja {
  const pot = vhod.trim().replace(/\\/g, "/").replace(/^\.\//, "");

  if (!pot) return { velja: false, razlog: "prazna pot" };
  if (pot.startsWith("/") || /^[a-zA-Z]:/.test(pot)) {
    return { velja: false, razlog: `absolutna pot ni dovoljena: ${pot}` };
  }
  if (pot.split("/").includes("..")) {
    return { velja: false, razlog: `pot vsebuje ".." : ${pot}` };
  }
  if (pot.includes("\0")) return { velja: false, razlog: "neveljaven znak v poti" };
  if (PREPOVEDANO.includes(pot)) {
    return { velja: false, razlog: `${pot} je varnostna meja in je ni dovoljeno spreminjati` };
  }
  if (!DOVOLJENE_KONCNICE.some((k) => pot.endsWith(k))) {
    return {
      velja: false,
      razlog: `dovoljene so samo končnice ${DOVOLJENE_KONCNICE.join(", ")}: ${pot}`,
    };
  }

  const vDosegu =
    DOSEG.some((d) => pot.startsWith(d)) || DOSEG_PREDPONE.some((d) => pot.startsWith(d));
  if (!vDosegu) {
    return {
      velja: false,
      razlog: `${pot} ni del projekta SBN Auto — dovoljeno je samo ${DOSEG.join(", ")} in ${DOSEG_PREDPONE.join(", ")}`,
    };
  }

  return { velja: true, pot };
}

/**
 * Refuses content that would smuggle a secret into the repository.
 *
 * A narrow check on purpose: it looks for the shapes of real credentials rather
 * than trying to judge intent. Its job is to stop an accident — a model copying
 * a key it saw in an error message into a file — not to defeat a determined
 * attacker, who would in any case already have to be an authenticated admin on
 * localhost.
 */
export function vsebujeSkrivnost(vsebina: string): string | null {
  const vzorci: [RegExp, string][] = [
    [/eyJhbGciOi[A-Za-z0-9_\-.]{20,}/, "JWT (morda Supabase ključ)"],
    [/sk-[A-Za-z0-9]{20,}/, "OpenAI ključ"],
    [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
    [/SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/, "service_role ključ"],
    [/re_[A-Za-z0-9]{20,}/, "Resend ključ"],
  ];
  for (const [vzorec, ime] of vzorci) {
    if (vzorec.test(vsebina)) return ime;
  }
  return null;
}

/**
 * Why the editor is not available in production.
 *
 * Stated as a value so the API and the screen say the same thing. Editing files
 * and running builds needs a writable checkout and a toolchain; a Vercel
 * function has neither, and an endpoint that could do it would be remote code
 * execution behind a session cookie.
 */
export const RAZLOG_SAMO_LOKALNO =
  "AI urejanje deluje samo v lokalnem razvojnem okolju. Na Vercelu ni zapisljivega odklopa repozitorija ne orodij za build, endpoint, ki bi to zmogel, pa bi bil oddaljeno izvajanje kode. Zaženite `npm run dev` in odprite to stran na localhost.";
