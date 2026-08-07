import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";
const M = Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (this: unknown, r: string, ...a: unknown[]) { return r === "server-only" ? {} : orig.call(this, r, ...a); };
const c = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of c.split("\n")) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i === -1) continue; const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!(k in process.env)) process.env[k] = v; }

/** Exactly what the provider sees on the base page, byte for byte. */
async function main() {
  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");

  const search = await searchAjpes({ activity: "49.410" });
  const row = search.rows[0];
  const res = await fetchAjpesAuthed(row.detailUrl, null);
  const text = stripHtmlToText(res.html);
  writeFileSync(`${process.env.TEMP}/ajpes-select.txt`, text, "utf-8");

  const flat = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase();
  console.log(`${row.name}\n${row.detailUrl}\n${text.length} znakov`);
  for (const needle of ["maticna stevilka", "davcna stevilka", "skrajsana firma", "popolno ime", "firma", "prijava"]) {
    console.log(`  flat vsebuje "${needle}": ${flat.includes(needle)}`);
  }
  console.log("\n--- prvih 600 znakov ---");
  console.log(JSON.stringify(text.slice(0, 600)));
  const i = flat.indexOf("firma");
  if (i !== -1) console.log("\n--- okolica 'firma' ---\n" + JSON.stringify(text.slice(Math.max(0, i - 200), i + 300)));
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
