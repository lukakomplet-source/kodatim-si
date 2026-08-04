// End-to-end test of the Lead skrejp flow, running the exact modules the page
// calls: searchAjpes() for discovery, then quickComplete() per company with the
// identity AJPES already returned. Writes nothing to the database.
//
//   npx tsx scripts/verify-lead-skrejp.ts [SKD koda] [koliko podjetij]

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

const pad = (v: string | null | undefined, n: number) => (v ?? "").slice(0, n).padEnd(n);

async function main() {
  console.log(`AJPES_USERNAME nastavljen: ${Boolean(process.env.AJPES_USERNAME)}`);
  console.log(`AJPES_PASSWORD nastavljen: ${Boolean(process.env.AJPES_PASSWORD)}\n`);

  const activity = process.argv[2] ?? "91.120";
  const limit = Number(process.argv[3] ?? 3);

  const { searchAjpes } = await import("@/lib/publicEnrichment/ajpesSearch");
  const { quickComplete } = await import("@/lib/publicEnrichment/quickComplete");

  console.log(`=== 1. KORAK: iskanje v AJPES (dejavnost ${activity}) ===`);
  const startedSearch = Date.now();
  const search = await searchAjpes({ activity });
  console.log(`${search.url}`);
  console.log(`${search.note}  (${((Date.now() - startedSearch) / 1000).toFixed(1)}s)\n`);
  console.log(`${pad("FIRMA", 46)} ${pad("SKRAJŠANA", 26)} ${pad("NASLOV", 26)} ${pad("MATIČNA", 12)} DAVČNA`);
  for (const r of search.rows.slice(0, 10)) {
    console.log(
      `${pad(r.name, 46)} ${pad(r.shortName, 26)} ${pad(`${r.address ?? ""}, ${r.city ?? ""}`, 26)} ${pad(r.registrationNumber, 12)} ${r.vatId ?? ""}`
    );
  }
  if (search.rows.length > 10) console.log(`… in še ${search.rows.length - 10}`);

  if (search.rows.length === 0) {
    console.log("\nNi zadetkov — skrejpa ni mogoče preizkusiti.");
    return;
  }

  console.log(`\n=== 2. KORAK: skrejp prvih ${limit} podjetij ===`);
  const table: Record<string, string>[] = [];
  for (const row of search.rows.slice(0, limit)) {
    const started = Date.now();
    const result = await quickComplete(row.shortName || row.name, row.city ?? undefined, {
      known: { vat_id: row.vatId, registration_number: row.registrationNumber },
      ajpesDetailUrl: row.detailUrl,
      onProgress: (e) =>
        console.log(`      ${e.state === "done" ? "✓" : "…"} ${e.label}: ${e.note.slice(0, 80)}${e.ms ? ` (${(e.ms / 1000).toFixed(1)}s)` : ""}`),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const filled = Object.values(result.fields).filter(Boolean).length;

    console.log(
      `\n${row.name}\n  ${filled} polj, ${seconds}s${result.bankrupt ? "  [V STEČAJU]" : ""}` +
        `\n  spletna stran: ${result.website ?? `— ${result.websiteNote}`}` +
        `\n  kontaktne osebe: ${result.contactPersons.join(", ") || "—"}` +
        `\n  opis: ${result.description ?? "—"}`
    );

    table.push({
      podjetje: row.name,
      status: result.fields.company_status ?? "",
      panoga: result.fields.industry ?? "",
      spletna: result.website ?? "",
      email: result.fields.email ?? "",
      telefon: result.fields.phone ?? "",
      prihodki: result.fields.revenue_amount ?? "",
      davcna: result.fields.vat_id ?? row.vatId ?? "",
    });
  }

  console.log(`\n=== 3. KORAK: tabela (kot v Excelu) ===`);
  console.log(
    `${pad("PODJETJE", 40)} ${pad("STATUS", 10)} ${pad("PANOGA", 18)} ${pad("SPLETNA", 26)} ${pad("EMAIL", 26)} ${pad("TELEFON", 12)} ${pad("PRIHODKI", 12)} DAVČNA`
  );
  for (const r of table) {
    console.log(
      `${pad(r.podjetje, 40)} ${pad(r.status, 10)} ${pad(r.panoga, 18)} ${pad(r.spletna, 26)} ${pad(r.email, 26)} ${pad(r.telefon, 12)} ${pad(r.prihodki, 12)} ${r.davcna}`
    );
  }
}

main().catch((err) => {
  console.error("Script crashed:", err);
  process.exit(1);
});
