import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

function loadEnvLocal(): void {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

/**
 * How fast may we go before a source pushes back?
 *
 *   npx tsx scripts/probe-rate-limits.ts
 *
 * Walks each source down a ladder of shorter and shorter gaps between
 * requests, and STOPS THAT SOURCE the moment it answers 429 (too fast) or 403
 * (blocked). The last gap that came back entirely clean is reported as safe.
 *
 * Deliberately conservative:
 *  - the ladder never goes below 750 ms, and the recommendation adds a margin
 *    on top of the last clean rung rather than reporting the edge itself;
 *  - one push-back ends that source's run — there is no "let's confirm it";
 *  - sources are probed one after another, never together, so a shared IP
 *    budget cannot make one look worse than it is;
 *  - each rung uses DIFFERENT queries, or a cache would hand back an
 *    undeserved clean sheet.
 *
 * Nothing is written to the codebase. The output is a set of RATE_* values to
 * put in .env.local; deleting them restores today's safe defaults.
 */

// The built-in adaptive limiter would pace these requests itself, which is
// exactly what is being measured here — so it is neutralised and this script
// does the spacing.
for (const p of ["AJPES", "COMPANYWALL", "BIZI"]) {
  process.env[`RATE_${p}_START_MS`] = "0";
  process.env[`RATE_${p}_MIN_MS`] = "0";
  process.env[`RATE_${p}_HEALTHY_STREAK`] = "999999";
}

/** Gaps to try, longest first. Stops at the first sign of push-back. */
const LADDER_MS = [5000, 3000, 2000, 1500, 1000, 750];
/** Requests per rung. Enough for a burst to register, few enough to be polite. */
const PER_RUNG = 8;
/** Breather between rungs so the previous burst cannot colour the next one. */
const COOLDOWN_MS = 15_000;

type Outcome = { ok: number; rateLimited: number; blocked: number; other: number; failed: number };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Distinct search terms — repeating one would measure the cache, not the limit. */
const COMPANY_TERMS = [
  "transport", "gradbeni", "arhiv", "trgovina", "storitve", "servis", "gostilna",
  "prevoz", "instalacije", "elektro", "avto", "les", "kovinar", "pekarna",
  "cvetlicarna", "frizer", "zobozdravstvo", "racunovodstvo", "svetovanje", "logistika",
  "gradnja", "montaza", "steklarstvo", "krovstvo", "vodovod", "kleparstvo",
  "mizarstvo", "kamnosestvo", "tapetnistvo", "urarstvo", "optika", "cistilni",
  "varovanje", "prevozi", "taxi", "selitve", "skladisce", "embalaza", "tisk", "grafika",
  "vrtnarstvo", "kmetija", "zganje", "vinarstvo", "mlekarna", "mesarija", "ribarstvo", "cebelarstvo",
];

/** Real activity codes, checked earlier against the official register. */
const AJPES_CODES = [
  "91.120", "01.470", "43.110", "43.130", "43.230", "43.341", "43.342", "43.600",
  "42.120", "42.130", "42.910", "42.990", "01.140", "01.150", "01.160", "01.240",
  "02.100", "02.200", "03.110", "03.120", "05.100", "06.100", "07.100", "08.110",
  "09.100", "10.110", "10.200", "10.310", "11.010", "11.020", "12.000", "13.100",
  "14.110", "15.110", "16.100", "17.110", "18.110", "19.100", "20.110", "21.100",
  "22.110", "23.110", "24.100", "25.110", "26.110", "27.110", "28.110", "29.100",
];

async function probeProvider(
  label: string,
  request: (index: number) => Promise<{ status: number } | { error: string }>
): Promise<{ label: string; safeMs: number | null; stoppedAt: number | null; reason: string }> {
  console.log(`\n=== ${label} ===`);
  let safeMs: number | null = null;

  for (const gap of LADDER_MS) {
    const out: Outcome = { ok: 0, rateLimited: 0, blocked: 0, other: 0, failed: 0 };
    let pushedBack = false;

    process.stdout.write(`  razmik ${String(gap).padStart(4)} ms: `);
    for (let i = 0; i < PER_RUNG; i++) {
      if (i > 0) await sleep(gap);
      const result = await request(i);

      if ("error" in result) {
        out.failed += 1;
        process.stdout.write("x");
        continue;
      }
      if (result.status === 429) {
        out.rateLimited += 1;
        pushedBack = true;
        process.stdout.write("!");
        break;
      }
      if (result.status === 403) {
        out.blocked += 1;
        pushedBack = true;
        process.stdout.write("B");
        break;
      }
      if (result.status >= 200 && result.status < 400) {
        out.ok += 1;
        process.stdout.write(".");
      } else {
        out.other += 1;
        process.stdout.write("?");
      }
    }

    console.log(
      `  ok=${out.ok} 429=${out.rateLimited} 403=${out.blocked} drugo=${out.other} napake=${out.failed}`
    );

    if (pushedBack) {
      const reason = out.blocked > 0 ? "403 (blokada)" : "429 (prehitro)";
      console.log(`  USTAVLJENO pri ${gap} ms — ${reason}. Varno ostaja ${safeMs ?? "—"} ms.`);
      return { label, safeMs, stoppedAt: gap, reason };
    }

    // Network failures are not push-back, but they make the rung unreliable —
    // do not claim it as safe and do not go faster on top of it.
    if (out.failed > PER_RUNG / 2) {
      console.log(`  preveč omrežnih napak — ustavljam brez sklepa.`);
      return { label, safeMs, stoppedAt: gap, reason: "omrežne napake" };
    }

    safeMs = gap;
    if (gap !== LADDER_MS[LADDER_MS.length - 1]) await sleep(COOLDOWN_MS);
  }

  return { label, safeMs, stoppedAt: null, reason: "brez odziva do najnižje stopnje" };
}

async function main() {
  const { providerFetch } = await import("@/lib/publicEnrichment/httpClient");
  const { toBiziSlug } = await import("@/lib/publicEnrichment/providers/bizi");
  const { buildAjpesSearchUrl } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");

  console.log("Merim varno hitrost. Legenda: . uspeh  ? drug status  x omrežna napaka");
  console.log("                            ! 429 prehitro  B 403 blokada (oboje takoj ustavi)\n");
  console.log("POMEMBNO: med tem testom naj worker NE teče.");

  const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };
  let term = 0;
  let code = 0;

  const results = [];

  results.push(
    await probeProvider("CompanyWall", async () => {
      const q = COMPANY_TERMS[term++ % COMPANY_TERMS.length];
      try {
        const res = await providerFetch(
          "companywall",
          `https://www.companywall.si/iskanje?q=${encodeURIComponent(q)}`,
          { headers: HEADERS, maxAttempts: 1 }
        );
        return { status: res.status };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "napaka" };
      }
    })
  );

  await sleep(COOLDOWN_MS);

  results.push(
    await probeProvider("Bizi", async () => {
      const q = COMPANY_TERMS[term++ % COMPANY_TERMS.length];
      try {
        const res = await providerFetch("bizi", `https://www.bizi.si/${toBiziSlug(q)}/`, {
          headers: HEADERS,
          maxAttempts: 1,
        });
        return { status: res.status };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "napaka" };
      }
    })
  );

  await sleep(COOLDOWN_MS);

  results.push(
    await probeProvider("AJPES", async () => {
      const activity = AJPES_CODES[code++ % AJPES_CODES.length];
      try {
        const { status } = await fetchAjpesAuthed(buildAjpesSearchUrl({ activity, status: "1" }), null);
        return { status };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "napaka" };
      }
    })
  );

  console.log("\n\n=== IZID ===");
  const envLines: string[] = [];
  for (const r of results) {
    if (r.safeMs === null) {
      console.log(`  ${r.label.padEnd(12)} že najvišja stopnja je sprožila odziv — pustite privzeto.`);
      continue;
    }
    // A margin on top of the last clean rung: the measured edge is where it
    // pushed back TODAY, and their limits move with load and time of day.
    const recommended = r.stoppedAt === null ? r.safeMs : Math.round(r.safeMs * 1.25);
    console.log(
      `  ${r.label.padEnd(12)} zadnji čist razmik ${r.safeMs} ms` +
        (r.stoppedAt ? ` (odziv pri ${r.stoppedAt} ms — ${r.reason})` : " (do konca lestvice brez odziva)") +
        ` → priporočeno ${recommended} ms`
    );
    envLines.push(`RATE_${r.label.toUpperCase()}_START_MS=${recommended}`);
    envLines.push(`RATE_${r.label.toUpperCase()}_MIN_MS=${recommended}`);
  }

  if (envLines.length > 0) {
    console.log("\nV .env.local dodajte:\n");
    for (const line of envLines) console.log(`  ${line}`);
    console.log("\nNazaj na privzeto: te vrstice preprosto pobrišite.");
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
