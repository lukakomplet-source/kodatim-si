import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";
const M = Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (this: unknown, r: string, ...a: unknown[]) { return r === "server-only" ? {} : orig.call(this, r, ...a); };
const c = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of c.split("\n")) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i === -1) continue; const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!(k in process.env)) process.env[k] = v; }

/** Does semantic search actually surface the right leads? Runs the real path. */
async function main() {
  const query = process.argv[2] ?? "avtovleka";
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { rankCandidates } = await import("@/lib/promocije/targeting");
  const admin = createAdminClient();

  const { data } = await admin.from("intel_leads").select("*").limit(120);
  const leads = (data ?? []) as never[];
  console.log(`Poizvedba: "${query}"  |  ${leads.length} leadov v bazi\n`);

  const ranked = await rankCandidates(leads, query, "prodaja", 60);
  for (const r of ranked.filter((x) => x.score > 0).slice(0, 10)) {
    console.log(`${String(r.score).padStart(3)}  ${r.lead.company_name.slice(0, 55).padEnd(55)}  ${r.reason.slice(0, 90)}`);
  }
  const zero = ranked.filter((x) => x.score === 0).length;
  console.log(`\n${ranked.length - zero} zadetkov, ${zero} brez ujemanja.`);
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
