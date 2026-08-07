import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Module from "node:module";
const M = Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown };
const orig = M._load;
M._load = function (this: unknown, r: string, ...a: unknown[]) { return r === "server-only" ? {} : orig.call(this, r, ...a); };
const c = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
for (const line of c.split("\n")) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i === -1) continue; const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); if (!(k in process.env)) process.env[k] = v; }

/**
 * Does searching AJPES by matična give a link that actually opens the company
 * card, for companies whose results-list link returns a stub?
 */
async function main() {
  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { fetchAjpesAuthed } = await import("@/lib/publicEnrichment/ajpesSession");
  const { stripHtmlToText } = await import("@/lib/publicEnrichment/htmlText");

  const search = await searchAjpes({ activity: process.argv[2] ?? "49.410" });
  let session = null as Awaited<ReturnType<typeof fetchAjpesAuthed>>["session"] | null;

  for (const row of search.rows.slice(0, 4)) {
    console.log(`\n=== ${row.name.slice(0, 60)}  (MŠ ${row.registrationNumber}) ===`);

    const direct = await fetchAjpesAuthed(row.detailUrl, session);
    session = direct.session;
    const directText = stripHtmlToText(direct.html);
    const directOk = /Matična številka|matična številka/i.test(directText);
    console.log(`  iz seznama: ${row.detailUrl}\n    ${directText.length} znakov, kartica: ${directOk}`);

    if (!row.registrationNumber) continue;
    const byMs = `https://www.ajpes.si/prs/rezultati.asp?status=1&maticna=${row.registrationNumber}&tip=1&MAXREC=100`;
    const res = await fetchAjpesAuthed(byMs, session);
    session = res.session;
    const tableStart = res.html.indexOf('id="tableRezultati"');
    const table = tableStart === -1 ? "" : res.html.slice(tableStart, res.html.indexOf("</table>", tableStart));
    const links = [...table.matchAll(/<a href="(podjetje\.asp\?[^"]+)">([^<]*)<\/a>/gi)];
    console.log(`  po matični: ${links.length} vrstic`);

    for (const link of links.slice(0, 2)) {
      const url = `https://www.ajpes.si/prs/${link[1].replace(/&amp;/g, "&")}`;
      const page = await fetchAjpesAuthed(url, session);
      session = page.session;
      const text = stripHtmlToText(page.html);
      console.log(`    ${link[2].trim().slice(0, 40)} -> ${url}\n      ${text.length} znakov, kartica: ${/Matična številka|matična številka/i.test(text)}`);
    }
  }
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
