import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";
const M = Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (this: unknown, r: string, ...a: unknown[]) { return r === "server-only" ? {} : orig.call(this, r, ...a); };
const c = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of c.split("\n")) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i === -1) continue; const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!(k in process.env)) process.env[k] = v; }

async function main() {
  const { providerFetch } = await import("@/lib/publicEnrichment/httpClient");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");
  for (const q of ["29685567", "SI29685567", "9950796000", "2-MB d.o.o."]) {
    const url = `https://www.companywall.si/iskanje?q=${encodeURIComponent(q)}`;
    const res = await providerFetch("companywall", url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" } });
    const html = await res.text();
    const rows = [...html.matchAll(/<h3[^>]*>[\s\S]*?<a href="(\/podjetje\/[^"]+)">([^<]+)<\/a>/gi)];
    console.log(`\nq="${q}" -> HTTP ${res.status}, ${rows.length} zadetkov`);
    for (const r of rows.slice(0, 3)) console.log(`   ${stripHtmlToText(r[2]).trim()}  ${r[1]}`);
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
