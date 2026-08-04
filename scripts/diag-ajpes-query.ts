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
 * Which query parameters does rezultati.asp actually honour? Only a response
 * containing <table id="tableRezultati"> is a real result set — links found
 * anywhere else on the page belong to the "recently viewed" widget and are
 * identical no matter what was searched for.
 */
const QUERIES: [string, string][] = [
  ["dejavnost (SKD koda)", "dejavnost=91.120&status=1&MAXREC=100"],
  ["dejavnost + občina", "dejavnost=91.120&obcina=070&status=1&MAXREC=100"],
  ["naziv (delni)", "naziv=arhiv&naziv_deli=1&status=1&MAXREC=100"],
  ["naselje", "naselje=Maribor&status=1&MAXREC=100"],
  ["posta", "posta=2000&status=1&MAXREC=100"],
];

async function main() {
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");
  let session = null as Awaited<ReturnType<typeof fetchAjpesAuthed>>["session"] | null;

  for (const [label, qs] of QUERIES) {
    const url = `https://www.ajpes.si/prs/rezultati.asp?${qs}`;
    try {
      const res = await fetchAjpesAuthed(url, session);
      session = res.session;
      const tableStart = res.html.indexOf('id="tableRezultati"');
      const tableHtml =
        tableStart === -1 ? "" : res.html.slice(tableStart, res.html.indexOf("</table>", tableStart));
      const rows = [...tableHtml.matchAll(/<a href="(podjetje\.asp\?[^"]+)">([^<]*)<\/a>/gi)];
      const total = res.html.match(/([\d.]+)\s*(?:zadetkov|zadetki|zadetka|zadetek)/i)?.[1] ?? "?";

      console.log(`\n=== ${label} ===\n${url}\n  HTTP ${res.status} | tabela: ${tableStart !== -1} | vrstic: ${rows.length} | skupaj po strani: ${total}`);
      for (const r of rows.slice(0, 4)) console.log(`    ${r[2].trim()}`);
    } catch (err) {
      console.log(`\n=== ${label} ===\n${url}\n  NAPAKA: ${err instanceof Error ? err.message : err}`);
    }
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
