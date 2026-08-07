import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";
const M = Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (this: unknown, r: string, ...a: unknown[]) { return r === "server-only" ? {} : orig.call(this, r, ...a); };
const c = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of c.split("\n")) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i === -1) continue; const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!(k in process.env)) process.env[k] = v; }

/** Several SKD codes in one search box. */
async function main() {
  const { searchAjpesMulti } = await import("@/lib/publicEnrichment/ajpesSearch");
  const codes = process.argv[2] ?? "49.410, 49.420, 52.290";
  const result = await searchAjpesMulti({ activity: codes });
  console.log(`Vnos: "${codes}"\n${result.note}\n`);
  for (const r of result.rows.slice(0, 6)) console.log(`  ${r.name.slice(0, 70)}`);
  console.log(`  … skupaj ${result.rows.length}`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
