"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Play, Square, Download, Upload, AlertTriangle, CheckCircle2, Loader2, Terminal } from "lucide-react";
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
  /** Per field, why it came back empty — surfaced in the "Zakaj manjka" column. */
  fieldNotes: Record<string, string>;
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

type LogEntry = {
  at: string;
  company: string;
  note: string;
  state: "start" | "done" | "info" | "error";
  ms?: number;
};

/**
 * Speed = how many companies the server works on at once inside one batch.
 * `batchSize` is a separate concern: it caps how long a single request runs, so
 * the hosting platform cannot cut the function off mid-company.
 */
const SPEEDS = {
  // Batch sizes are deliberately small: one company can take ~30 s, and the
  // hosting plan caps how long a single function may run. A batch that goes
  // over is cut off mid-company, which is what produced "Skrejp se ni
  // zaključil" rows for companies whose data was perfectly available.
  slow: { label: "Počasi in varno", concurrency: 1, batchSize: 2, hint: "1 hkrati — najmanjše tveganje blokade" },
  medium: { label: "Srednje", concurrency: 3, batchSize: 4, hint: "3 hkrati — hitreje, možne blokade" },
  fast: { label: "Hitro", concurrency: 5, batchSize: 6, hint: "5 hkrati — realno tvegate 429/403" },
} as const;
type SpeedKey = keyof typeof SPEEDS;

/** Columns of the final spreadsheet, in the order they are shown and exported. */
const COLUMNS: { key: string; label: string }[] = [
  { key: "company_name", label: "Podjetje" },
  { key: "why_missing", label: "Zakaj manjka" },
  { key: "description", label: "Opis" },
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

/** The fields that decide whether a row is actually usable as a lead. */
const KEY_FIELDS = ["email", "phone", "website", "contact_person", "revenue_amount"];

/**
 * Why this row is thin — the whole point being that a blank cell always has a
 * stated cause, whether that is a failed scrape or a source that genuinely
 * publishes nothing.
 */
function whyMissing(row: Row): string {
  if (row.status === "error") return `Napaka: ${row.error ?? "neznana"}`;
  if (row.status === "waiting") return "še ni skrejpano";
  if (row.status === "running") return "v teku …";

  const result = row.result;
  if (!result) return "";
  if (result.warning) return result.warning;

  const missing = KEY_FIELDS.filter((f) =>
    f === "website" ? !result.website : f === "contact_person" ? result.contactPersons.length === 0 : !result.fields[f]
  );
  if (missing.length === 0) return "";

  const reasons = missing.map((f) => {
    if (f === "website") return `spletna stran: ${result.websiteNote}`;
    if (f === "contact_person") return "kontaktne osebe: v registrih ni vpisane osebe";
    return `${f}: ${result.fieldNotes?.[f] ?? "noben vir ni objavil tega podatka"}`;
  });
  return reasons.join(" · ");
}

function valueFor(row: Row, key: string): string {
  if (key === "company_name") return row.name;
  if (key === "why_missing") return whyMissing(row);
  if (key === "description") return row.result?.description ?? "";
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
  // "Ustavi" has to cut the request that is already streaming, not just stop
  // queueing the next batch.
  const abortRef = useRef<AbortController | null>(null);
  // Latest rows, readable from inside the stream loop without re-subscribing.
  const rowsRef = useRef<Row[]>([]);

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Live log: what the scrape is doing right now, newest last.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  function addLog(company: string, note: string, state: LogEntry["state"], ms?: number) {
    setLog((prev) => {
      const next = [
        ...prev,
        { at: new Date().toLocaleTimeString("sl-SI"), company, note, state, ms },
      ];
      // Bounded so a 100-company run can't grow the page without limit.
      return next.length > 400 ? next.slice(-400) : next;
    });
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [log]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const scrapedRows = useMemo(() => rows.filter((r) => r.status === "done"), [rows]);

  async function runSearch(): Promise<Row[]> {
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
        return [];
      }
      const found: Row[] = (json.rows as SearchRow[]).map((r) => ({ ...r, status: "waiting" as const }));
      setRows(found);
      setSelected(new Set(found.map((_, i) => i)));
      setSearchNote(json.note ?? null);
      return found;
    } catch {
      setSearchError("Prišlo je do napake pri iskanju.");
      return [];
    } finally {
      setSearching(false);
    }
  }

  /**
   * One button for the whole job: enter an SKD code, and the search and the
   * scrape run back to back without a second click. The rows are passed
   * straight through rather than read back from state, which has not been
   * committed yet at this point.
   */
  async function searchAndScrape() {
    const found = await runSearch();
    if (found.length === 0) return;
    await scrapeAll(found.map((row, index) => ({ row, index })));
  }

  /**
   * Scrapes one batch in a single request, reading the NDJSON stream so each
   * step lands in the log as it happens.
   *
   * A request per company was silently broken in production: every concurrent
   * request gets its own serverless instance, so the server could not keep one
   * AJPES session (its select-then-read is stateful) and the instances logged
   * each other out. One request per batch fixes that AND keeps each function
   * call short enough not to be cut off.
   */
  /** Returns the indices this batch did not finish, for the caller to re-queue. */
  async function scrapeBatch(batch: { row: Row; index: number }[]): Promise<number[]> {
    const controller = new AbortController();
    abortRef.current = controller;

    setRows((prev) =>
      prev.map((r, i) => (batch.some((b) => b.index === i) ? { ...r, status: "running" } : r))
    );

    const nameFor = (index: number) => rowsRef.current[index]?.shortName || rowsRef.current[index]?.name || `#${index}`;
    const handled = new Set<number>();

    try {
      const res = await fetch("/api/admin/lead-skrejp/scrape-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          concurrency: SPEEDS[speed].concurrency,
          companies: batch.map(({ row, index }) => ({
            index,
            name: row.name,
            // The short name is what CompanyWall and Bizi list companies under.
            searchName: row.shortName || row.name,
            city: row.city,
            vatId: row.vatId,
            registrationNumber: row.registrationNumber,
            ajpesDetailUrl: row.detailUrl,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const message = res.ok ? "Prazen odgovor strežnika." : `Napaka strežnika (${res.status}).`;
        addLog("paket", message, "error");
        markBatchFailed(batch, message, handled);
        return [];
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Companies the server deliberately left for the next batch because its
      // time budget ran out — not failures.
      let deferred: number[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the partial last line for the next chunk
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.progress) {
              addLog(
                event.progress.company ?? nameFor(event.progress.index),
                `${event.progress.label} — ${event.progress.note}`,
                event.progress.state,
                event.progress.ms
              );
            } else if (event.row) {
              const { index, result, ms } = event.row as { index: number; result: ScrapeResult; ms: number };
              handled.add(index);
              addLog(nameFor(index), `končano — ${Object.keys(result.fields ?? {}).length} polj`, "done", ms);
              setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status: "done", result } : r)));
            } else if (event.rowError) {
              const { index, error } = event.rowError as { index: number; error: string };
              handled.add(index);
              addLog(nameFor(index), error, "error");
              setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status: "error", error } : r)));
            } else if (event.done) {
              deferred = (event.done.unprocessed as number[] | undefined) ?? [];
              if (deferred.length > 0) {
                addLog("paket", `${deferred.length} podjetij prenesenih v naslednji paket (časovni proračun)`, "info");
              }
            }
          } catch {
            // A truncated line is not fatal — the next chunk completes it.
          }
        }
      }

      // Deferred = the server chose to postpone them. Anything else it never
      // reported on was cut off mid-flight; both go back into the queue, and
      // the rows return to "waiting" rather than showing a failure.
      const pending = [
        ...new Set([...deferred, ...batch.map((b) => b.index).filter((i) => !handled.has(i))]),
      ];
      if (pending.length > 0) {
        setRows((prev) =>
          prev.map((r, i) => (pending.includes(i) && r.status === "running" ? { ...r, status: "waiting" } : r))
        );
      }
      return pending;
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const message = aborted ? "ustavljeno" : "zahtevek ni uspel";
      addLog("paket", message, aborted ? "info" : "error");
      markBatchFailed(batch, aborted ? "ustavljeno pred obdelavo" : "zahtevek ni uspel", handled);
      return [];
    } finally {
      abortRef.current = null;
    }
  }

  /** Rows the batch never reported on keep a stated reason instead of spinning forever. */
  function markBatchFailed(batch: { index: number }[], message: string, handled: Set<number>) {
    const missing = batch.filter((b) => !handled.has(b.index)).map((b) => b.index);
    if (missing.length === 0) return;
    setRows((prev) =>
      prev.map((r, i) => (missing.includes(i) && r.status === "running" ? { ...r, status: "error", error: message } : r))
    );
  }

  /** How many times a company may be re-queued before it is called a failure. */
  const MAX_ATTEMPTS = 3;

  async function scrapeAll(queue: { row: Row; index: number }[]) {
    if (queue.length === 0) return;

    setScraping(true);
    stopRef.current = false;
    const { batchSize } = SPEEDS[speed];

    const attempts = new Map<number, number>();
    let remaining = [...queue];

    // Batches go one after another: two scrape requests in flight would land on
    // separate server instances and collide over the single AJPES session.
    while (remaining.length > 0 && !stopRef.current) {
      const requeued: { row: Row; index: number }[] = [];

      for (let i = 0; i < remaining.length; i += batchSize) {
        if (stopRef.current) break;
        const batch = remaining.slice(i, i + batchSize);
        const pending = await scrapeBatch(batch);

        for (const index of pending) {
          const used = (attempts.get(index) ?? 0) + 1;
          attempts.set(index, used);
          const entry = batch.find((b) => b.index === index);
          if (!entry) continue;

          if (used < MAX_ATTEMPTS) {
            requeued.push(entry);
          } else {
            // Give up, but say why — the row is not silently blank.
            const message = `obdelava se ni zaključila v ${MAX_ATTEMPTS} poskusih (časovna omejitev funkcije) — poskusite z nastavitvijo „Počasi in varno“`;
            addLog(entry.row.shortName || entry.row.name, message, "error");
            setRows((prev) => prev.map((r, j) => (j === index ? { ...r, status: "error", error: message } : r)));
          }
        }
      }

      remaining = requeued;
      if (remaining.length > 0 && !stopRef.current) {
        addLog("paket", `${remaining.length} podjetij gre v ponovni poskus`, "info");
      }
    }
    setScraping(false);
  }

  /** Re-run only the ticked rows — for retrying failures or a partial selection. */
  async function startScrape() {
    await scrapeAll(rows.map((row, index) => ({ row, index })).filter(({ index }) => selected.has(index)));
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
          "other_activities",
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
        <p className="text-sm font-semibold text-zinc-900">1. Kaj naj skrejpa</p>
        <p className="mt-1 text-xs text-zinc-500">
          Vnesite SKD kodo (ali kateri koli drug pogoj) in pritisnite <strong>Poišči in skrejpaj</strong> —
          podjetja se poiščejo v AJPES in skrejpajo samodejno, brez dodatnega klika. AJPES vrne
          največ 100 podjetij na iskanje; pri večjem številu zadetkov iskanje zožite
          (npr. dejavnost + poštna številka).
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
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Hitrost skrejpanja
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value as SpeedKey)}
              disabled={scraping}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none disabled:bg-zinc-50"
            >
              {(Object.keys(SPEEDS) as SpeedKey[]).map((k) => (
                <option key={k} value={k}>
                  {SPEEDS[k].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {scraping ? (
            <button
              type="button"
              onClick={() => {
                stopRef.current = true;
                abortRef.current?.abort();
              }}
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              <Square className="h-4 w-4" />
              Ustavi
            </button>
          ) : (
            <button
              type="button"
              onClick={searchAndScrape}
              disabled={searching}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {searching ? "Iščem v AJPES …" : "Poišči in skrejpaj"}
            </button>
          )}
          <button
            type="button"
            onClick={runSearch}
            disabled={searching || scraping}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            Samo poišči
          </button>
          <span className="text-xs text-zinc-400">{SPEEDS[speed].hint}</span>
        </div>

        {searchError && <p className="mt-2 text-xs text-red-500">{searchError}</p>}
        {searchNote && <p className="mt-2 text-xs text-zinc-500">{searchNote}</p>}
      </div>

      {(rows.length > 0 || log.length > 0) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">2. Rezultat</p>
              <p className="mt-1 text-xs text-zinc-500">
                Vsako podjetje gre skozi AJPES → CompanyWall → Bizi → spletno stran.
                Najdenih {rows.length}, končanih {doneCount}
                {errorCount > 0 && `, napak ${errorCount}`}. Označenih {selected.size}.
              </p>
            </div>
            {!scraping && doneCount < rows.length && (
              <button
                type="button"
                onClick={startScrape}
                disabled={selected.size === 0}
                className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Skrejpaj označene
              </button>
            )}
          </div>

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

          {/*
            Live log. The scrape is a long series of network calls against four
            different sources; without this the page just sits there and a
            source that is stuck is indistinguishable from one that is slow.
          */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-950 p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <Terminal className="h-3.5 w-3.5 text-zinc-400" />}
                Kaj se dogaja
              </p>
              {log.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLog([])}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  Počisti
                </button>
              )}
            </div>
            <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {log.length === 0 ? (
                <p className="text-zinc-500">Še ni dogodkov — pritisnite „Poišči in skrejpaj&ldquo;.</p>
              ) : (
                log.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0 text-zinc-600">{entry.at}</span>
                    <span
                      className={
                        entry.state === "error"
                          ? "text-red-400"
                          : entry.state === "done"
                            ? "text-emerald-400"
                            : entry.state === "start"
                              ? "text-zinc-300"
                              : "text-zinc-400"
                      }
                    >
                      <span className="text-zinc-500">{entry.company}</span> · {entry.note}
                      {entry.ms !== undefined && ` (${(entry.ms / 1000).toFixed(1)}s)`}
                    </span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
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
                    const isWhy = c.key === "why_missing";
                    const tone = isStatus && row.result?.bankrupt
                      ? "font-semibold text-red-600"
                      : isWhy
                        ? row.status === "error"
                          ? "text-red-600"
                          : "text-amber-700"
                        : "text-zinc-700";
                    return (
                      <td
                        key={c.key}
                        className={`${isWhy || c.key === "description" ? "max-w-[320px]" : "max-w-[220px]"} truncate px-3 py-2 align-top ${tone}`}
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
