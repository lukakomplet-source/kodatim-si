"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Play, Square, Download, Upload, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { importScrapedLeads, type ScrapedLeadInput } from "./actions";

/**
 * "Lead skrejp" — bulk discovery + enrichment with a spreadsheet at the end.
 *
 * Step 1 asks AJPES which companies match the criteria (that search alone
 * already returns name, address, matična and davčna). Step 2 runs each of them
 * through the same chain the import screen uses — AJPES, CompanyWall, Bizi,
 * spletna stran — one request per company so the table fills in live and can be
 * stopped at any point. Step 3 exports to CSV or pushes the picked rows into
 * Lead Intelligence.
 *
 * The loop lives here rather than on the server so progress is visible and
 * interruptible; this is an interactive research tool, not the durable 400k
 * pipeline (that one is the worker + enrichment_jobs queue).
 */

type SearchRow = {
  name: string;
  shortName: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  registrationNumber: string | null;
  vatId: string | null;
  detailUrl: string;
};

type ScrapeResult = {
  website: string | null;
  websiteNote: string;
  fields: Record<string, string>;
  sources: Record<string, string>;
  contactPersons: string[];
  bankrupt: boolean;
  description: string | null;
  warning?: string;
};

type Row = SearchRow & {
  status: "waiting" | "running" | "done" | "error";
  error?: string;
  result?: ScrapeResult;
};

/** Speeds map to how many companies run at once and how long to pause between them. */
const SPEEDS = {
  slow: { label: "Počasi in varno", concurrency: 1, pauseMs: 1500, hint: "1 hkrati — najmanjše tveganje blokade" },
  medium: { label: "Srednje", concurrency: 3, pauseMs: 500, hint: "3 hkrati — hitreje, možne blokade" },
  fast: { label: "Hitro", concurrency: 5, pauseMs: 0, hint: "5 hkrati — realno tvegate 429/403" },
} as const;
type SpeedKey = keyof typeof SPEEDS;

/** Columns of the final spreadsheet, in the order they are shown and exported. */
const COLUMNS: { key: string; label: string }[] = [
  { key: "company_name", label: "Podjetje" },
  { key: "company_status", label: "Status" },
  { key: "industry", label: "Panoga" },
  { key: "skd_code", label: "SKD" },
  { key: "skd_name", label: "SKD naziv" },
  { key: "website", label: "Spletna stran" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefon" },
  { key: "contact_person", label: "Kontaktne osebe" },
  { key: "address_street", label: "Ulica" },
  { key: "postal_code", label: "Pošta" },
  { key: "address_city", label: "Mesto" },
  { key: "vat_id", label: "Davčna" },
  { key: "registration_number", label: "Matična" },
  { key: "employees_count", label: "Zaposleni" },
  { key: "revenue_amount", label: "Prihodki" },
  { key: "revenue_year", label: "Leto" },
  { key: "profit", label: "Dobiček" },
  { key: "credit_rating", label: "Boniteta" },
  { key: "director", label: "Direktor" },
  { key: "owners", label: "Lastniki" },
  { key: "founded_date", label: "Ustanovljeno" },
  { key: "legal_form", label: "Pravna oblika" },
  { key: "bank_account", label: "TRR" },
  { key: "official_long_name", label: "Polni naziv" },
];

function valueFor(row: Row, key: string): string {
  if (key === "company_name") return row.name;
  if (key === "contact_person") return row.result?.contactPersons.join(", ") ?? "";
  if (key === "website") return row.result?.website ?? "";
  // Before the scrape runs, the AJPES search row is already worth showing.
  const fallback: Record<string, string | null> = {
    vat_id: row.vatId,
    registration_number: row.registrationNumber,
    address_street: row.address,
    address_city: row.city,
    postal_code: row.postalCode,
  };
  return row.result?.fields[key] ?? fallback[key] ?? "";
}

function toCsv(rows: Row[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = COLUMNS.map((c) => escape(c.label)).join(";");
  const body = rows.map((r) => COLUMNS.map((c) => escape(valueFor(r, c.key))).join(";"));
  // Semicolons + BOM so Excel in a Slovenian locale opens it in columns.
  return `﻿${[head, ...body].join("\r\n")}`;
}

export default function LeadScrapeClient() {
  const [activity, setActivity] = useState("");
  const [name, setName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [town, setTown] = useState("");
  const [status, setStatus] = useState("1");

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [speed, setSpeed] = useState<SpeedKey>("slow");
  const [scraping, setScraping] = useState(false);
  const stopRef = useRef(false);

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const scrapedRows = useMemo(() => rows.filter((r) => r.status === "done"), [rows]);

  async function runSearch() {
    setSearching(true);
    setSearchError(null);
    setSearchNote(null);
    setImportMessage(null);
    try {
      const res = await fetch("/api/admin/lead-skrejp/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity, name, postalCode, town, status }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSearchError(json?.error ?? "Iskanje ni uspelo.");
        return;
      }
      const found: Row[] = (json.rows as SearchRow[]).map((r) => ({ ...r, status: "waiting" as const }));
      setRows(found);
      setSelected(new Set(found.map((_, i) => i)));
      setSearchNote(json.note ?? null);
    } catch {
      setSearchError("Prišlo je do napake pri iskanju.");
    } finally {
      setSearching(false);
    }
  }

  async function scrapeOne(index: number, row: Row) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status: "running" } : r)));
    try {
      const res = await fetch("/api/admin/lead-skrejp/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The short name is what CompanyWall and Bizi list companies under.
          companyName: row.shortName || row.name,
          city: row.city,
          vatId: row.vatId,
          registrationNumber: row.registrationNumber,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r, i) => (i === index ? { ...r, status: "error", error: json?.error ?? "Napaka." } : r))
        );
        return;
      }
      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status: "done", result: json } : r)));
    } catch {
      setRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, status: "error", error: "Zahtevek ni uspel." } : r))
      );
    }
  }

  async function startScrape() {
    const queue = rows.map((row, index) => ({ row, index })).filter(({ index }) => selected.has(index));
    if (queue.length === 0) return;

    setScraping(true);
    stopRef.current = false;
    const { concurrency, pauseMs } = SPEEDS[speed];

    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (!stopRef.current) {
        const next = queue[cursor++];
        if (!next) break;
        await scrapeOne(next.index, next.row);
        if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
      }
    });
    await Promise.all(workers);
    setScraping(false);
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(scrapedRows.length > 0 ? scrapedRows : rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead-skrejp-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importSelected() {
    const payload: ScrapedLeadInput[] = rows
      .filter((r, i) => selected.has(i) && r.status === "done")
      .map((r) => {
        const f = r.result?.fields ?? {};
        const custom: Record<string, string> = {};
        for (const key of [
          "skd_code", "skd_name", "skis_code", "skis_name", "registration_number", "director",
          "owners", "authorized_representatives", "founded_date", "legal_form", "company_status",
          "company_size", "employees_count", "revenue_amount", "revenue_year", "profit", "ebitda",
          "credit_rating", "official_name", "official_long_name", "bank_account", "postal_code",
        ]) {
          if (f[key]) custom[key] = f[key];
        }
        return {
          company_name: r.name,
          industry: f.industry ?? null,
          website: r.result?.website ?? null,
          email: f.email ?? null,
          phone: f.phone ?? null,
          address_street: f.address_street ?? r.address,
          address_city: f.address_city ?? r.city,
          address_country: f.address_country ?? null,
          vat_id: f.vat_id ?? r.vatId,
          contact_person: r.result?.contactPersons.join(", ") || null,
          notes: r.result?.description ? `AI opis: ${r.result.description}` : null,
          custom_fields: custom,
        };
      });

    if (payload.length === 0) {
      setImportMessage("Izberite vsaj eno vrstico, ki je že skrejpana.");
      return;
    }

    setImporting(true);
    setImportMessage(null);
    const result = await importScrapedLeads(payload);
    setImporting(false);

    if (result.error) {
      setImportMessage(result.error);
      return;
    }
    setImportMessage(
      `Uvoženih ${result.inserted} leadov.` +
        (result.skipped ? ` Preskočenih ${result.skipped} (že v bazi): ${result.skippedNames?.slice(0, 5).join(", ")}${(result.skippedNames?.length ?? 0) > 5 ? " …" : ""}` : "")
    );
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i))));
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">1. Poišči podjetja v AJPES</p>
        <p className="mt-1 text-xs text-zinc-500">
          Vnesite vsaj en pogoj. AJPES vrne največ 100 podjetij na iskanje — pri večjem številu
          zadetkov iskanje zožite (npr. dejavnost + poštna številka).
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Dejavnost (SKD koda)
            <input
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="npr. 91.120"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ime podjetja (delno)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="npr. arhiv"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Poštna številka
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="npr. 2000"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Kraj
            <input
              value={town}
              onChange={(e) => setTown(e.target.value)}
              placeholder="npr. Maribor"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none"
            >
              <option value="1">Aktivne enote</option>
              <option value="2">Izbrisane enote</option>
              <option value="4">Aktivne in izbrisane</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={runSearch}
              disabled={searching}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? "Iščem …" : "Poišči v AJPES"}
            </button>
          </div>
        </div>
        {searchError && <p className="mt-2 text-xs text-red-500">{searchError}</p>}
        {searchNote && <p className="mt-2 text-xs text-zinc-500">{searchNote}</p>}
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">2. Skrejpaj izbrana podjetja</p>
              <p className="mt-1 text-xs text-zinc-500">
                Vsako podjetje gre skozi AJPES → CompanyWall → Bizi → spletno stran.
                Izbranih {selected.size} od {rows.length}. Končanih {doneCount}
                {errorCount > 0 && `, napak ${errorCount}`}.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Hitrost
                <select
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value as SpeedKey)}
                  disabled={scraping}
                  className="mt-1 block rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none disabled:bg-zinc-50"
                >
                  {(Object.keys(SPEEDS) as SpeedKey[]).map((k) => (
                    <option key={k} value={k}>
                      {SPEEDS[k].label}
                    </option>
                  ))}
                </select>
              </label>
              {scraping ? (
                <button
                  type="button"
                  onClick={() => {
                    stopRef.current = true;
                  }}
                  className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
                >
                  <Square className="h-4 w-4" />
                  Ustavi
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startScrape}
                  disabled={selected.size === 0}
                  className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Začni skrejp
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">{SPEEDS[speed].hint}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <Download className="h-4 w-4" />
              Prenesi CSV (Excel)
            </button>
            <button
              type="button"
              onClick={importSelected}
              disabled={importing || doneCount === 0}
              className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Uvozi v Lead Intelligence
            </button>
          </div>
          {importMessage && <p className="mt-2 text-xs text-emerald-600">{importMessage}</p>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === rows.length && rows.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 font-medium">#</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row, index) => (
                <tr key={`${row.detailUrl}-${index}`} className={row.status === "error" ? "bg-red-50/40" : undefined}>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(index)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-zinc-400">
                    {row.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
                    {row.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    {row.status === "error" && (
                      <span title={row.error}>
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      </span>
                    )}
                    {row.status === "waiting" && index + 1}
                  </td>
                  {COLUMNS.map((c) => {
                    const value = valueFor(row, c.key);
                    const isStatus = c.key === "company_status";
                    return (
                      <td
                        key={c.key}
                        className={`max-w-[220px] truncate px-3 py-2 align-top ${
                          isStatus && row.result?.bankrupt ? "font-semibold text-red-600" : "text-zinc-700"
                        }`}
                        title={value}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
