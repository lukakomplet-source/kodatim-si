import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Pulls the official SKD activity list from the source AJPES's own search form
 * uses, and bundles it as JSON.
 *
 * Deliberately an unauthenticated plain fetch: the enrichment client would log
 * in, and a second login invalidates the session a scrape may be using. The
 * dropdown data is public anyway.
 *
 * Run again if AJPES ever revises the classification:
 *   npx tsx scripts/fetch-skd-list.ts
 */

const FORM_URL = "https://www.ajpes.si/prs/";
const OUT = resolve(process.cwd(), "src/lib/publicEnrichment/skdCodes.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function main() {
  const form = await fetch(FORM_URL, { headers: { "User-Agent": UA } });
  const html = await form.text();
  console.log(`obrazec: HTTP ${form.status}, ${html.length} znakov`);

  const start = html.search(/<select[^>]*name="dejavnost"/i);
  if (start === -1) throw new Error("Na strani ni izbirnika dejavnosti.");
  const tag = html.slice(start, html.indexOf(">", start) + 1);
  console.log(`izbirnik: ${tag.replace(/\s+/g, " ")}`);

  const ajax = tag.match(/data-ajax-url="([^"]+)"/i)?.[1];
  if (!ajax) throw new Error("Izbirnik nima data-ajax-url — seznam prihaja od drugod.");

  const url = new URL(ajax, FORM_URL).toString();
  console.log(`vir seznama: ${url}`);

  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: FORM_URL } });
  const body = await res.text();
  console.log(`seznam: HTTP ${res.status}, ${body.length} znakov`);
  console.log(`začetek: ${body.slice(0, 200).replace(/\s+/g, " ")}`);

  const parsed = JSON.parse(body.replace(/^﻿/, "").trim()) as { data?: { id?: string; desc?: string }[] };
  const entries = (parsed.data ?? [])
    .map((d) => {
      const code = (d.id ?? "").trim();
      // AJPES prefixes every description with the code again ("01.110 01.110
      // Pridelovanje riža" once rendered) — drop the duplicate.
      const label = (d.desc ?? "").trim().replace(new RegExp(`^${code.replace(".", "\\.")}\\s*`), "");
      return { code, label };
    })
    .filter((e) => e.code && e.label);

  if (entries.length === 0) throw new Error("Seznam dejavnosti je prazen.");

  writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");
  console.log(`\nshranjenih ${entries.length} dejavnosti -> ${OUT}`);
  for (const e of entries.slice(0, 5)) console.log(`  ${e.code}  ${e.label}`);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
