import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";
const M = Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (this: unknown, r: string, ...a: unknown[]) { return r === "server-only" ? {} : orig.call(this, r, ...a); };
const c = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of c.split("\n")) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i === -1) continue; const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!(k in process.env)) process.env[k] = v; }

/** Why do a few AJPES pages parse to nothing? Dump them and look. */
async function main() {
  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");

  const search = await searchAjpes({ activity: "01.110" });
  for (const wanted of ["AGROSLOVEN", "AKTRA"]) {
    const row = search.rows.find((r) => r.name.includes(wanted));
    if (!row) { console.log(`${wanted}: ni v zadetkih`); continue; }
    const base = await fetchAjpesAuthed(row.detailUrl, null);
    const baseText = stripHtmlToText(base.html);
    console.log(`
--- OSNOVNA ${row.detailUrl} -> HTTP ${base.status}, ${baseText.length} znakov, "Matična številka": ${baseText.includes("Matična številka")}`);
    const url = `${row.detailUrl}&p=1`;
    const { html, status } = await fetchAjpesAuthed(url, base.session);
    const text = stripHtmlToText(html);
    writeFileSync(`${process.env.TEMP}/ajpes-${wanted}.txt`, text, "utf-8");
    console.log(`\n=== ${wanted} ===\n${url}\nHTTP ${status}, ${text.length} znakov`);
    for (const label of ["matična številka:", "popolno ime:", "regija:", "glavna dejavnost:", "Podatki o delu", "del subjekta", "podružnic"]) {
      console.log(`  "${label}": ${text.includes(label)}`);
    }
    const i = text.indexOf("popolno ime");
    console.log("  okolica:", JSON.stringify(text.slice(Math.max(0, i - 200), i + 260)));
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
