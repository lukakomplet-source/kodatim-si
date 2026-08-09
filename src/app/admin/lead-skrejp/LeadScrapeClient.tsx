"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Play,
  Square,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Terminal,
  Columns3,
  HelpCircle,
  Sparkles,
  Plus,
  Check,
  ChevronUp,
  Server,
  Copy,
  RotateCcw,
  BarChart3,
} from "lucide-react";
import { importScrapedLeads, type ScrapedLeadInput } from "./actions";
import { useRestoreOnce, useAutoSave, clearSavedState } from "@/lib/useSavedState";
import { searchSkd, invalidSkdCodes, skdByCode, SKD_CODES, type SkdEntry } from "@/lib/skd";

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
 * One narrowing of the AJPES search. The server hands these back whenever a
 * query hits the hundred-row cap and has to be cut up; the queue lives here so
 * a long discovery survives the function's time limit.
 */
type SearchSlice = {
  activity: string;
  status: string;
  municipality?: string;
  street?: string;
  /** Set on the slices a run starts from — their totals form the expected sum. */
  isRoot?: boolean;
};

/** Everything worth surviving a closed tab. */
type SkrejpSession = {
  activity: string;
  name: string;
  postalCode: string;
  town: string;
  status: string;
  speed: SpeedKey;
  contactsOnly: boolean;
  rows: Row[];
  selected: number[];
  log: LogEntry[];
  /** Search slices not yet run, so an interrupted discovery can be resumed. */
  pendingSlices?: SearchSlice[];
  /** How many companies AJPES said exist, to check the search against. */
  expectedTotal?: number | null;
  /** Which columns the table shows. Undefined (an older session) means all. */
  visibleColumns?: string[];
  /** The area as typed ("Savinjska regija") and the municipalities it resolved to. */
  area?: string;
  municipalities?: string[];
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
  fast: {
    label: "Hitro",
    concurrency: 5,
    batchSize: 6,
    hint: "5 hkrati; AJPES detajl se preskoči (brez regije in ustanoviteljev) — največja hitrost",
  },
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
 * The subset worth seeing when you are working the list rather than auditing
 * it: who they are, how to reach them, and how big they are.
 */
const ESSENTIAL_COLUMNS = [
  "company_name",
  "why_missing",
  "website",
  "email",
  "phone",
  "contact_person",
  "address_city",
  "revenue_amount",
  "employees_count",
];

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


/** Columns whose values are numbers written the Slovenian way ("662.276,60"). */
const NUMERIC_COLUMNS = new Set([
  "revenue_amount",
  "revenue_year",
  "profit",
  "employees_count",
  "postal_code",
  "vat_id",
  "registration_number",
]);

/**
 * "662.276,60" is six hundred thousand, not 662.28 — the dot groups thousands
 * and the comma is the decimal point. Sorting on the raw string put 99 above
 * 662.276,60, which is exactly backwards for picking the biggest company.
 */
function toNumber(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

/** How many activities the bundled official list holds, for the finder's blurb. */
const SKD_COUNT = SKD_CODES.length;

/** One activity in the SKD finder: click to put it in the field, click to remove. */
function SkdRow({
  code,
  label,
  note,
  chosen,
  onToggle,
}: {
  code: string;
  label: string;
  note?: string;
  chosen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
        chosen
          ? "border-accent bg-accent/10 text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-accent/40 hover:bg-accent/5"
      }`}
    >
      {chosen ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      ) : (
        <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
      )}
      <span className="min-w-0">
        <span className="font-semibold text-zinc-900">{code}</span> {label}
        {note && <span className="block text-[11px] text-zinc-500">{note}</span>}
      </span>
    </button>
  );
}

/**
 * One number from the scrape, with its share of the scraped rows drawn as a
 * bar. `total` is omitted for counts that are not a share of anything (how many
 * companies the search found).
 */
function StatTile({
  label,
  value,
  total,
  tone,
  highlight,
}: {
  label: string;
  value: number;
  total?: number;
  tone: "zinc" | "accent" | "emerald" | "red";
  highlight?: boolean;
}) {
  const percent = total && total > 0 ? Math.round((value / total) * 100) : null;
  const bar = {
    zinc: "bg-zinc-400",
    accent: "bg-accent",
    emerald: "bg-emerald-500",
    red: "bg-red-500",
  }[tone];
  const text = {
    zinc: "text-zinc-900",
    accent: "text-accent",
    emerald: "text-emerald-600",
    red: "text-red-600",
  }[tone];

  return (
    <div
      className={`rounded-xl px-3.5 py-3 ${
        highlight ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-zinc-50"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold tabular-nums ${text}`}>
          {value.toLocaleString("sl-SI")}
        </span>
        {percent !== null && <span className="text-xs font-medium text-zinc-500">{percent} %</span>}
      </p>
      {percent !== null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
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

  /**
   * An area instead of a single place: "Savinjska regija" resolves (via the
   * resolve-area endpoint, validated against the official register) into the
   * municipalities the search is then restricted to.
   */
  const [area, setArea] = useState("");
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaNote, setAreaNote] = useState<string | null>(null);

  async function resolveArea() {
    const query = area.trim();
    if (!query) return;
    setAreaBusy(true);
    setAreaNote(null);
    try {
      const res = await fetch("/api/admin/lead-skrejp/resolve-area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: query }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAreaNote(json?.error ?? "Območja ni bilo mogoče razrešiti.");
        return;
      }
      setMunicipalities(json.municipalities ?? []);
      setAreaNote(
        (json.municipalities?.length ?? 0) > 0
          ? `${json.municipalities.length} občin${json.note ? ` — ${json.note}` : ""}`
          : json.note ?? "Ni najdenih občin."
      );
    } catch {
      setAreaNote("Prišlo je do napake pri razreševanju območja.");
    } finally {
      setAreaBusy(false);
    }
  }

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  /**
   * Discovery progress. A big SKD code is a few hundred AJPES queries at ~5 s
   * each, so this is a minutes-long job with its own progress, not a click that
   * either works or doesn't.
   */
  const [pendingSlices, setPendingSlices] = useState<SearchSlice[]>([]);
  const [expectedTotal, setExpectedTotal] = useState<number | null>(null);
  const [queriesDone, setQueriesDone] = useState(0);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  // Queries already done when this run began, so a resumed search measures its
  // own pace rather than averaging in an earlier session's.
  const [queriesAtStart, setQueriesAtStart] = useState(0);
  const [gaps, setGaps] = useState<string[]>([]);

  /**
   * Sorting is by column, and a numeric column starts at the biggest — asking
   * for "prihodki" almost always means "who is the largest", not "who is the
   * smallest". Clicking the same header again reverses it.
   */
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  /**
   * Twenty-seven columns is more than fits on any screen. Hiding some is a
   * viewing preference only — the CSV export and the Lead Intelligence import
   * always carry everything that was scraped.
   */
  const [visibleColumns, setVisibleColumns] = useState<string[]>(COLUMNS.map((c) => c.key));
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const shownColumns = useMemo(
    // Driven off COLUMNS so the on-screen order never depends on click order.
    () => COLUMNS.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  const [speed, setSpeed] = useState<SpeedKey>("slow");
  /**
   * "Only email + phone" — skips the AJPES detail, the website search and the
   * page read, which are the slow steps and irrelevant to contacts. A later
   * full scrape + import then TOPS UP the same leads (import merges, see
   * importScrapedLeads), so this is the fast first pass in a two-pass workflow.
   */
  const [contactsOnly, setContactsOnly] = useState(false);
  const [scraping, setScraping] = useState(false);
  const stopRef = useRef(false);
  // "Ustavi" has to cut the request that is already streaming, not just stop
  // queueing the next batch.
  const abortRef = useRef<AbortController | null>(null);
  // Latest rows, readable from inside the stream loop without re-subscribing.
  const rowsRef = useRef<Row[]>([]);

  /**
   * Progress and a running estimate. The estimate is measured, not assumed:
   * companies vary from 5 s (cached) to 40 s (full scrape with a website
   * search), so a fixed per-company guess would be wrong all day. Rate comes
   * from what this run has actually managed since it started.
   */
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [doneAtStart, setDoneAtStart] = useState(0);
  const [now, setNow] = useState(Date.now());

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  /**
   * The SKD finder. Nobody knows 678 five-digit codes by heart, and typing the
   * wrong one searches the wrong industry without ever looking like an error.
   */
  const [showSkdFinder, setShowSkdFinder] = useState(false);
  const [skdQuery, setSkdQuery] = useState("");
  const [skdAiResults, setSkdAiResults] = useState<{ code: string; label: string; why: string }[] | null>(null);
  const [skdAiBusy, setSkdAiBusy] = useState(false);
  const [skdAiError, setSkdAiError] = useState<string | null>(null);
  // Instant, offline, no request per keystroke — the whole list is bundled.
  const skdMatches = useMemo<SkdEntry[]>(() => searchSkd(skdQuery), [skdQuery]);

  /** Codes already in the field, so the finder can show what is picked. */
  const chosenCodes = useMemo(
    () => new Set(activity.split(/[,;\s]+/).map((c) => c.trim()).filter(Boolean)),
    [activity]
  );

  // Stale codes with one-click replacements — see invalidSkdCodes for why.
  const invalidCodes = useMemo(() => invalidSkdCodes(chosenCodes), [chosenCodes]);

  /** Swap a stale code for the suggested real one, in place. */
  function replaceCode(oldCode: string, newCode: string) {
    setActivity((prev) =>
      prev
        .split(/[,;\s]+/)
        .map((c) => (c.trim() === oldCode ? newCode : c.trim()))
        .filter(Boolean)
        .join(", ")
    );
  }

  function toggleCode(code: string) {
    setActivity((prev) => {
      const codes = prev.split(/[,;\s]+/).map((c) => c.trim()).filter(Boolean);
      const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
      return next.join(", ");
    });
  }

  /**
   * State of the background queue. Polled only while there is something in it,
   * so an idle screen makes no requests.
   */
  const [queueCounts, setQueueCounts] = useState<{
    pending: number;
    running: number;
    done: number;
    failed: number;
  } | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/enrichment-queue");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setQueueError(json?.error ?? "Vrste ni bilo mogoče prebrati.");
          return;
        }
        setQueueError(null);
        setQueueCounts(json.counts);
      } catch {
        // Offline or mid-navigation; the next tick tries again.
      }
    };
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const queueBusy = (queueCounts?.pending ?? 0) + (queueCounts?.running ?? 0) > 0;

  async function askAiForSkd() {
    const q = skdQuery.trim();
    if (!q) return;
    setSkdAiBusy(true);
    setSkdAiError(null);
    setSkdAiResults(null);
    try {
      const res = await fetch("/api/admin/skd-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSkdAiError(json?.error ?? "Iskanje ni uspelo.");
        return;
      }
      setSkdAiResults(json.codes ?? []);
    } catch {
      setSkdAiError("Prišlo je do napake.");
    } finally {
      setSkdAiBusy(false);
    }
  }

  // Live log: what the scrape is doing right now, newest last.
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  /**
   * The whole screen, kept on the server so closing the tab — or switching
   * from a phone to a desk — does not throw the work away. Only "Počisti"
   * removes it.
   */
  const { restored, loaded: sessionLoaded } = useRestoreOnce<SkrejpSession>("lead-skrejp", (saved) => {
    setActivity(saved.activity ?? "");
    setName(saved.name ?? "");
    setPostalCode(saved.postalCode ?? "");
    setTown(saved.town ?? "");
    setStatus(saved.status ?? "1");
    if (saved.speed && saved.speed in SPEEDS) setSpeed(saved.speed);
    setContactsOnly(Boolean(saved.contactsOnly));
    // A row left mid-flight when the tab closed is waiting again, not running.
    setRows((saved.rows ?? []).map((r) => (r.status === "running" ? { ...r, status: "waiting" as const } : r)));
    setSelected(new Set(saved.selected ?? []));
    setLog(saved.log ?? []);
    setPendingSlices(saved.pendingSlices ?? []);
    setExpectedTotal(saved.expectedTotal ?? null);
    setArea(saved.area ?? "");
    setMunicipalities(saved.municipalities ?? []);
    // Drop keys from columns that no longer exist, and fall back to everything
    // for a session saved before the picker existed.
    if (saved.visibleColumns?.length) {
      setVisibleColumns(saved.visibleColumns.filter((k) => COLUMNS.some((c) => c.key === k)));
    }
  });

  const session: SkrejpSession = {
    activity,
    name,
    postalCode,
    town,
    status,
    speed,
    contactsOnly,
    rows,
    selected: [...selected],
    log: log.slice(-120),
    pendingSlices,
    expectedTotal,
    visibleColumns,
    area,
    municipalities,
  };
  useAutoSave("lead-skrejp", session, sessionLoaded);

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

  // Only ticks while something is in flight, so an idle page does nothing.
  useEffect(() => {
    if (!scraping && !searching) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [scraping, searching]);

  // Kept paired with the original index so sorting the view cannot desynchronise
  // the checkboxes, which are keyed on position in `rows`.
  const displayRows = useMemo(() => {
    const entries = rows.map((row, index) => ({ row, index }));
    if (!sort) return entries;

    const numeric = NUMERIC_COLUMNS.has(sort.key);
    const factor = sort.dir === "asc" ? 1 : -1;
    return entries.sort((a, b) => {
      const av = valueFor(a.row, sort.key);
      const bv = valueFor(b.row, sort.key);
      // Blanks always sink, whichever way the column is pointing.
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      if (numeric) return (toNumber(av) - toNumber(bv)) * factor;
      return av.localeCompare(bv, "sl") * factor;
    });
  }, [rows, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (prev?.key !== key) {
        // First click: biggest first for numbers, A-Z for text.
        return { key, dir: NUMERIC_COLUMNS.has(key) ? "desc" : "asc" };
      }
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  /**
   * What the scrape actually produced — the numbers that decide whether this
   * batch was worth running. Percentages are of the SCRAPED rows, not of all
   * found: a row nobody has looked at yet cannot be counted as "no email", and
   * dividing by the total would make every run look like a failure until the
   * very end.
   */
  const stats = useMemo(() => {
    const scraped = rows.filter((r) => r.status === "done");
    const has = (fn: (r: Row) => boolean) => scraped.filter(fn).length;
    const email = has((r) => Boolean(r.result?.fields.email));
    const phone = has((r) => Boolean(r.result?.fields.phone));
    const website = has((r) => Boolean(r.result?.website));
    return {
      found: rows.length,
      scraped: scraped.length,
      email,
      phone,
      website,
      person: has((r) => (r.result?.contactPersons.length ?? 0) > 0),
      revenue: has((r) => Boolean(r.result?.fields.revenue_amount)),
      bankrupt: has((r) => Boolean(r.result?.bankrupt)),
      // The one number that matters: rows you can actually reach someone at.
      reachable: has((r) => Boolean(r.result?.fields.email || r.result?.fields.phone || r.result?.website)),
    };
  }, [rows]);

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const scrapedRows = useMemo(() => rows.filter((r) => r.status === "done"), [rows]);

  const finishedCount = doneCount + errorCount;
  const percent = rows.length === 0 ? 0 : Math.round((finishedCount / rows.length) * 100);

  /** Seconds left, from this run's own measured pace. Null until it has a pace. */
  const etaSeconds = (() => {
    if (!scraping || !runStartedAt) return null;
    const finishedThisRun = finishedCount - doneAtStart;
    if (finishedThisRun < 1) return null;
    const perCompanyMs = (now - runStartedAt) / finishedThisRun;
    const remaining = rows.length - finishedCount;
    return remaining > 0 ? Math.round((remaining * perCompanyMs) / 1000) : 0;
  })();

  /**
   * Discovery progress. Prefer companies-against-expected — it is the number
   * that answers "will I get all of them" — and fall back to queries done
   * against queries left before AJPES has told us the size of the code.
   */
  const searchPercent = (() => {
    if (expectedTotal && expectedTotal > 0) {
      return Math.min(100, Math.round((rows.length / expectedTotal) * 100));
    }
    const total = queriesDone + pendingSlices.length;
    return total === 0 ? 0 : Math.round((queriesDone / total) * 100);
  })();

  /** Seconds left in discovery, from this run's own measured query rate. */
  const searchEtaSeconds = (() => {
    if (!searching || !searchStartedAt) return null;
    const thisRun = queriesDone - queriesAtStart;
    if (thisRun < 1) return null;
    const perQueryMs = (now - searchStartedAt) / thisRun;
    return Math.round((pendingSlices.length * perQueryMs) / 1000);
  })();

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  /**
   * Finds EVERY company matching the criteria, not the hundred AJPES is willing
   * to show at once.
   *
   * AJPES caps a search at 100 rows and offers no pager, but the cap is per
   * query — so a capped query gets cut into municipalities, and a municipality
   * that is still capped gets cut by street initial (AJPES matches `ulica` from
   * the start, and the per-initial counts add up to the unsliced total exactly).
   * The server runs as many slices as its time budget allows and returns the
   * rest; this loop keeps sending them back until the queue is empty.
   *
   * @param resumeFrom Slices left over from an interrupted run. Rows already on
   * screen are kept and added to, rather than the search starting over.
   */
  async function runSearch(resumeFrom?: SearchSlice[]): Promise<Row[]> {
    setSearching(true);
    setSearchError(null);
    setSearchNote(null);
    setImportMessage(null);
    setSearchStartedAt(Date.now());
    setGaps([]);
    stopRef.current = false;

    // The page address is the identity: one company can sit in two slices when
    // several SKD codes are searched at once, and must appear once.
    const byUrl = new Map<string, Row>();
    if (resumeFrom) for (const row of rowsRef.current) byUrl.set(row.detailUrl, row);

    let queue: SearchSlice[] = resumeFrom ?? [];
    let expected = resumeFrom ? expectedTotal : null;
    let queries = resumeFrom ? queriesDone : 0;
    setQueriesAtStart(queries);
    if (!resumeFrom) {
      setQueriesDone(0);
      setExpectedTotal(null);
    }
    const foundGaps: string[] = [];

    const publish = () => {
      const list = [...byUrl.values()];
      setRows(list);
      setSelected(new Set(list.map((_, i) => i)));
      rowsRef.current = list;
    };

    try {
      for (;;) {
        if (stopRef.current) break;

        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch("/api/admin/lead-skrejp/search-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ activity, name, postalCode, town, status, municipalities, slices: queue }),
        });

        if (!res.ok || !res.body) {
          const message = await res
            .json()
            .then((j) => (typeof j?.error === "string" ? j.error : null))
            .catch(() => null);
          setSearchError(message ?? `Iskanje ni uspelo (${res.status}).`);
          break;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Rebuilt as the stream goes so a dropped connection can be resumed
        // without losing the municipalities a capped slice just produced.
        let cursor = 0;
        const discovered: SearchSlice[] = [];
        let nextQueue: SearchSlice[] | null = null;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.progress) {
                addLog(event.progress.label, event.progress.note, event.progress.state);
              } else if (event.slice) {
                const s = event.slice as {
                  index: number;
                  rows: SearchRow[];
                  total: number | null;
                  isRoot: boolean;
                  children: SearchSlice[];
                };
                cursor = s.index + 1;
                discovered.push(...s.children);
                queries += 1;
                setQueriesDone(queries);

                // Only an unsliced query knows the size of the whole code; the
                // slices below it each report their own share.
                if (s.isRoot && typeof s.total === "number") {
                  expected = (expected ?? 0) + s.total;
                  setExpectedTotal(expected);
                }
                for (const r of s.rows) {
                  if (!byUrl.has(r.detailUrl)) byUrl.set(r.detailUrl, { ...r, status: "waiting" });
                }
                publish();
              } else if (event.done) {
                nextQueue = (event.done.pending as SearchSlice[]) ?? [];
                foundGaps.push(...((event.done.gaps as string[]) ?? []));
              }
            } catch {
              // A truncated line is completed by the next chunk.
            }
          }
        }

        // No closing `done` means the function was cut off mid-stream. What it
        // had not reached, plus what it discovered along the way, is the queue.
        queue = nextQueue ?? [...queue.slice(cursor), ...discovered];
        setPendingSlices(queue);
        if (queue.length === 0) break;
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setSearchError("Prišlo je do napake pri iskanju.");
      }
    } finally {
      abortRef.current = null;
      setSearching(false);
    }

    const found = [...byUrl.values()];
    publish();
    setGaps(foundGaps);

    const stopped = stopRef.current || queue.length > 0;
    const codeCount = activity.split(/[,;\s]+/).filter(Boolean).length;
    const n = (v: number) => v.toLocaleString("sl-SI");

    setSearchNote(
      [
        expected === null
          ? `Najdenih ${n(found.length)} podjetij.`
          : stopped
            ? `Zbranih ${n(found.length)} od ${n(expected)} — iskanje ni dokončano.`
            : found.length >= expected
              ? `Najdenih vseh ${n(found.length)} podjetij (AJPES jih javlja ${n(expected)}).`
              : codeCount > 1
                ? // With several codes the expected number is a sum across them, so a
                  // company registered under two of them is counted twice there but
                  // once here. Fewer rows than expected is normal, not a shortfall.
                  `Najdenih ${n(found.length)} različnih podjetij; AJPES po vseh ${codeCount} kodah skupaj javlja ${n(expected)} vpisov (podjetje pod dvema kodama je tam šteto dvakrat).`
                : `Najdenih ${n(found.length)} od ${n(expected)}, ki jih javlja AJPES — ${n(expected - found.length)} jih ni bilo mogoče zajeti.`,
        // A few thousand companies is days of scraping in an open tab; the queue
        // exists precisely for this and the button for it is right below.
        !stopped && found.length > 300
          ? "Pri tem številu je smiselno uporabiti „Uvozi vse in dokončaj v ozadju“ — skrejp v zavihku bi trajal predolgo."
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    );
    return stopped ? [] : found;
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
  /**
   * Returns what still needs doing: `pending` to re-queue, and which of those
   * the server merely postponed rather than failed on.
   */
  async function scrapeBatch(
    batch: { row: Row; index: number }[]
  ): Promise<{ pending: number[]; deferred: number[] }> {
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
          // "Hitro" = maximum speed: AJPES's detail read is the serialised
          // floor of every batch, and these rows arrived from the AJPES search
          // with identity already proven.
          skipAjpesWhenKnown: speed === "fast",
          contactsOnly,
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
        return { pending: [], deferred: [] };
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

      // Two different things, and conflating them was a real bug: the server
      // DEFERRED these (its time budget ran out before it started them), while
      // anything else unreported was CUT OFF mid-flight. A deferral is not an
      // attempt — counting it as one marked perfectly good companies as failed
      // after three rounds, which is exactly what happened with a 25 s budget
      // and companies that take longer than that.
      const cutOff = batch.map((b) => b.index).filter((i) => !handled.has(i) && !deferred.includes(i));
      const pending = [...new Set([...deferred, ...cutOff])];
      if (pending.length > 0) {
        setRows((prev) =>
          prev.map((r, i) => (pending.includes(i) && r.status === "running" ? { ...r, status: "waiting" } : r))
        );
      }
      return { pending, deferred };
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (aborted) {
        addLog("paket", "ustavljeno", "info");
        markBatchFailed(batch, "ustavljeno pred obdelavo", handled);
        return { pending: [], deferred: [] };
      }
      // The connection dropped mid-stream — which is how a function being
      // killed for exceeding its time limit actually presents itself. That is
      // not the company's fault, so its row goes back in the queue instead of
      // being branded a failure.
      const unfinished = batch.map((b) => b.index).filter((i) => !handled.has(i));
      addLog("paket", `povezava prekinjena — ${unfinished.length} podjetij nazaj v vrsto`, "info");
      setRows((prev) =>
        prev.map((r, i) => (unfinished.includes(i) && r.status === "running" ? { ...r, status: "waiting" } : r))
      );
      return { pending: unfinished, deferred: [] };
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
    setRunStartedAt(Date.now());
    setDoneAtStart(rows.filter((r) => r.status === "done").length);
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
        const { pending, deferred } = await scrapeBatch(batch);

        for (const index of pending) {
          const entry = batch.find((b) => b.index === index);
          if (!entry) continue;

          // A company the server postponed was never tried, so it costs no
          // attempt — it simply goes round again.
          if (deferred.includes(index)) {
            requeued.push(entry);
            continue;
          }

          const used = (attempts.get(index) ?? 0) + 1;
          attempts.set(index, used);

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

  /**
   * Prefill handed over from a themed campaign: /admin/lead-skrejp?skd=...&obcine=...
   *
   * Applied only after the saved session has been restored — the restore would
   * otherwise overwrite it a moment later — and read from window.location
   * rather than useSearchParams, which would demand a Suspense boundary around
   * the whole screen for one mount-time read. The URL is cleaned afterwards so
   * a reload does not re-apply stale filters over newer work.
   */
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (!sessionLoaded || prefillApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    const skd = params.get("skd");
    const obcine = params.get("obcine");
    if (!skd && !obcine) return;
    prefillApplied.current = true;

    // Deferred a tick: the restore that just finished set state this same
    // render pass, and stacking more synchronous setState on top of it is the
    // cascading-render pattern the lint rule exists to catch.
    queueMicrotask(() => {
      if (skd) setActivity(skd);
      if (obcine) {
        const list = obcine.split("|").map((m) => m.trim()).filter(Boolean);
        setMunicipalities(list);
        setAreaNote(`${list.length} občin, prevzetih iz tematske kampanje.`);
      }
      addLog("kampanja", "SKD kode in občine prevzete iz tematske kampanje — pritisnite „Poišči in skrejpaj“.", "info");
    });
    window.history.replaceState(null, "", "/admin/lead-skrejp");
  }, [sessionLoaded]);

  /**
   * The clean-slate button: stop everything, wipe everything, reload.
   *
   * State is emptied BEFORE the reload, because leaving the page flushes the
   * autosave — with the old state still in place, that flush would faithfully
   * re-save the session that was just deleted, and the "nadaljujete tam, kjer
   * ste ostali" banner would walk straight back in after the reload.
   */
  function fullReset() {
    if (!confirm("Ustaviti iskanje in skrejpanje ter izbrisati vse najdeno? Tega ni mogoče razveljaviti.")) return;
    stopRef.current = true;
    abortRef.current?.abort();
    setActivity("");
    setName("");
    setPostalCode("");
    setTown("");
    setRows([]);
    setSelected(new Set());
    setLog([]);
    setSort(null);
    setSearchNote(null);
    setSearchError(null);
    setImportMessage(null);
    setPendingSlices([]);
    setExpectedTotal(null);
    setArea("");
    setMunicipalities([]);
    setAreaNote(null);
    void clearSavedState("lead-skrejp");
    // The reload is the point: it guarantees no loop, stream or timer
    // survives — exactly the manual refresh this button replaces.
    setTimeout(() => window.location.reload(), 150);
  }

  /** Re-run only the ticked rows — for retrying failures or a partial selection. */
  async function startScrape() {
    await scrapeAll(rows.map((row, index) => ({ row, index })).filter(({ index }) => selected.has(index)));
  }

  /**
   * Rows that are not finished, or finished thin. Converging on a full table in
   * a few passes beats re-running everything: what is already complete costs
   * nothing to keep, and a source that was rate-limited a minute ago usually
   * answers on the next try.
   */
  const incomplete = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
          if (row.status !== "done") return true;
          const r = row.result;
          if (!r) return true;
          // Anything without a way to reach the company is worth another go.
          return !r.fields.email && !r.fields.phone && !r.website;
        }),
    [rows]
  );

  async function scrapeIncomplete() {
    setSelected(new Set(incomplete.map((e) => e.index)));
    await scrapeAll(incomplete);
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

  /**
   * @param includeUnscraped Also import rows the browser never got to, and
   * queue them for the background worker. They arrive with what AJPES already
   * gave (name, address, davčna, matična) and are finished with the tab shut.
   */
  async function importSelected(includeUnscraped = false) {
    const payload: ScrapedLeadInput[] = rows
      .filter((r, i) => selected.has(i) && (r.status === "done" || includeUnscraped))
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
      setImportMessage(
        includeUnscraped ? "Izberite vsaj eno vrstico." : "Izberite vsaj eno vrstico, ki je že skrejpana."
      );
      return;
    }

    setImporting(true);
    setImportMessage(null);
    const result = await importScrapedLeads(payload, includeUnscraped);
    setImporting(false);

    if (result.error) {
      setImportMessage(result.error);
      return;
    }
    setImportMessage(
      `Uvoženih ${result.inserted ?? 0} novih leadov.` +
        (result.updated ? ` Dopolnjenih ${result.updated} obstoječih (dodani manjkajoči podatki, nič prepisano).` : "") +
        (result.queued ? ` ${result.queued} jih čaka na obdelavo v ozadju — poženite \`npm run worker\`.` : "")
    );
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i))));
  }

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      if (!prev.includes(key)) return [...prev, key];
      // Hiding the last one would leave a table of nothing but checkboxes.
      return prev.length === 1 ? prev : prev.filter((k) => k !== key);
    });
  }

  return (
    <div className="mt-6 space-y-5">
      {restored && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
          <p className="text-sm text-emerald-800">
            Nadaljujete tam, kjer ste ostali — {rows.length} podjetij, {doneCount} končanih. Delo se
            samodejno shranjuje in se ne izgubi, ko zaprete stran.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!confirm("Počistiti shranjeno delo? Tega ni mogoče razveljaviti.")) return;
              void clearSavedState("lead-skrejp");
              setRows([]);
              setSelected(new Set());
              setLog([]);
              setSearchNote(null);
              setPendingSlices([]);
              setExpectedTotal(null);
              setQueriesDone(0);
              setGaps([]);
            }}
            className="rounded-full border border-emerald-300 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Počisti
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">1. Kaj naj skrejpa</p>
        <p className="mt-1 text-xs text-zinc-500">
          Vnesite eno ali več SKD kod, ločenih z vejico (ali kateri koli drug pogoj), in pritisnite <strong>Poišči in skrejpaj</strong> —
          podjetja se poiščejo v AJPES in skrejpajo samodejno, brez dodatnega klika. AJPES na eno
          poizvedbo vrne največ 100 podjetij, zato se pri večjih kodah iskanje samodejno razbije
          po občinah (in po potrebi še po ulicah), dokler ni zajeto <strong>vsako</strong> podjetje.
          Pri kodi s tisoči zadetkov to traja nekaj minut — tabela se polni sproti in iskanje
          lahko kadar koli ustavite ali nadaljujete.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="skd-input">Dejavnost (SKD kode)</label>
              <button
                type="button"
                onClick={() => setShowSkdFinder((v) => !v)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-accent hover:bg-accent/10"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Ne veste kode?
              </button>
            </div>
            <input
              id="skd-input"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="npr. 49.410, 49.420, 52.290"
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:outline-none ${
                invalidCodes.length > 0
                  ? "border-red-300 focus:border-red-400"
                  : "border-zinc-200 focus:border-accent/50"
              }`}
            />
            {/* Hover a code to see what trade it actually is. */}
            {[...chosenCodes].some((c) => skdByCode(c)) && (
              <span className="mt-1.5 flex flex-wrap gap-1 font-normal normal-case tracking-normal">
                {[...chosenCodes].map((c) => {
                  const entry = skdByCode(c);
                  if (!entry) return null;
                  return (
                    <span
                      key={c}
                      title={`${entry.code} — ${entry.label}`}
                      className="cursor-help rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600"
                    >
                      {c}
                    </span>
                  );
                })}
              </span>
            )}
            {invalidCodes.map(({ code, suggestions }) => (
              <div key={code} className="mt-1.5 text-[11px] font-normal normal-case tracking-normal">
                <span className="font-semibold text-red-600">
                  {code} ni v uradnem šifrantu (SKD 2025) — AJPES zanjo vrne 0 podjetij.
                </span>
                {suggestions.length > 0 && (
                  <span className="ml-1 inline-flex flex-wrap items-center gap-1 text-zinc-600">
                    Ste mislili:
                    {suggestions.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => replaceCode(code, s.code)}
                        title={s.label}
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        {s.code} {s.label.length > 30 ? `${s.label.slice(0, 30)}…` : s.label}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
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
            Območje (regija ali okolica)
            <span className="mt-1 flex gap-2">
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void resolveArea();
                  }
                }}
                placeholder="npr. Savinjska regija, Celje okolica"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-900 focus:border-accent/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={resolveArea}
                disabled={areaBusy || !area.trim()}
                title="AI iz uradnega seznama 212 občin izbere tiste, ki spadajo v opisano območje"
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {areaBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Najdi občine
              </button>
            </span>
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
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Kaj skrejpat
            <span className="mt-1 flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 font-normal normal-case tracking-normal">
              <input
                type="checkbox"
                checked={contactsOnly}
                onChange={(e) => setContactsOnly(e.target.checked)}
                disabled={scraping}
                className="h-4 w-4"
              />
              <span className="text-sm text-zinc-700">
                Samo kontakti (email + telefon)
                <span className="block text-[11px] text-zinc-400">
                  ~3× hitreje — brez opisa, spletne strani in AJPES detajla. Kasnejši poln skrejp jih
                  ob uvozu dopolni.
                </span>
              </span>
            </span>
          </label>
        </div>

        {(municipalities.length > 0 || areaNote) && (
          <div className="mt-3">
            {areaNote && <p className="text-xs text-zinc-500">{areaNote}</p>}
            {municipalities.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-700">
                  Iskanje omejeno na {municipalities.length} občin:
                </span>
                {municipalities.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMunicipalities((prev) => prev.filter((x) => x !== m))}
                    title="Odstrani občino iz iskanja"
                    className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20"
                  >
                    {m} ×
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMunicipalities([]);
                    setAreaNote(null);
                  }}
                  className="text-[11px] font-semibold text-zinc-500 underline hover:text-zinc-900"
                >
                  odstrani omejitev
                </button>
              </div>
            )}
          </div>
        )}

        {showSkdFinder && (
          <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
            {/*
              The title itself closes the panel. The small "Ne veste kode?"
              link that opens it is easy to lose track of once the panel is
              covering the screen, so the way out has to be where you are
              already looking.
            */}
            <button
              type="button"
              onClick={() => setShowSkdFinder(false)}
              className="flex w-full items-center justify-between gap-2 text-left"
              title="Zapri"
            >
              <span className="text-sm font-semibold text-zinc-900">Poišči SKD kodo</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                Zapri
                <ChevronUp className="h-4 w-4" />
              </span>
            </button>
            <p className="mt-1 text-xs text-zinc-500">
              Vpišite panogo, stroko ali vrsto podjetja — npr. „gradbeništvo“, „zobozdravnik“,
              „odvoz smeti“. Seznam je uraden, iz registra AJPES ({SKD_COUNT} dejavnosti).
              Kliknite kodo, da jo dodate v polje.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={skdQuery}
                onChange={(e) => setSkdQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void askAiForSkd();
                  }
                }}
                placeholder="npr. gradbeništvo, prevozništvo, frizer …"
                className="min-w-[16rem] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={askAiForSkd}
                disabled={skdAiBusy || !skdQuery.trim()}
                title="Kadar iskanje po besedah ne najde pravega — npr. „avtoprevozniki“ proti uradnemu „Cestni tovorni promet“"
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {skdAiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Poišči z AI
              </button>
            </div>

            {skdAiError && <p className="mt-2 text-xs text-red-500">{skdAiError}</p>}

            {chosenCodes.size > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-zinc-500">Izbrano:</span>
                {[...chosenCodes].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleCode(code)}
                    title="Odstrani"
                    className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-80"
                  >
                    {code} ×
                  </button>
                ))}
              </div>
            )}

            {/*
              AI results are shown separately and never merged into the word
              matches: they are a suggestion about meaning, while the list below
              is a literal match. Worth being able to tell apart.
            */}
            {skdAiResults && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-zinc-700">
                  Predlogi AI ({skdAiResults.length})
                </p>
                {skdAiResults.length === 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Za ta opis v uradnem seznamu ni ustrezne dejavnosti.
                  </p>
                )}
                <div className="mt-1.5 space-y-1">
                  {skdAiResults.map((r) => (
                    <SkdRow
                      key={r.code}
                      code={r.code}
                      label={r.label}
                      note={r.why}
                      chosen={chosenCodes.has(r.code)}
                      onToggle={() => toggleCode(r.code)}
                    />
                  ))}
                </div>
              </div>
            )}

            {skdQuery.trim() && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-zinc-700">
                  Ujemanje po besedah ({skdMatches.length})
                </p>
                {skdMatches.length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Po besedah ni zadetka — poskusite „Poišči z AI“.
                  </p>
                ) : (
                  <div className="mt-1.5 max-h-72 space-y-1 overflow-y-auto pr-1">
                    {skdMatches.map((m) => (
                      <SkdRow
                        key={m.code}
                        code={m.code}
                        label={m.label}
                        chosen={chosenCodes.has(m.code)}
                        onToggle={() => toggleCode(m.code)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {scraping || searching ? (
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
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Play className="h-4 w-4" />
              Poišči in skrejpaj
            </button>
          )}
          <button
            type="button"
            onClick={() => runSearch()}
            disabled={searching || scraping}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            Samo poišči
          </button>
          {/*
            An interrupted discovery is not lost work: the slices it never got
            to are saved with the rest of the screen, so it picks up mid-run
            even after the tab was closed.
          */}
          {!searching && !scraping && pendingSlices.length > 0 && (
            <button
              type="button"
              onClick={() => runSearch(pendingSlices)}
              className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent/10"
            >
              <Play className="h-4 w-4" />
              Nadaljuj iskanje ({pendingSlices.length} delov)
            </button>
          )}
          {(searching || scraping || rows.length > 0 || pendingSlices.length > 0) && (
            <button
              type="button"
              onClick={fullReset}
              title="Ustavi vse, izbriši najdeno in začni s prazno stranjo"
              className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <RotateCcw className="h-4 w-4" />
              Resetiraj vse
            </button>
          )}
          <span className="text-xs text-zinc-400">{SPEEDS[speed].hint}</span>
        </div>

        {(searching || pendingSlices.length > 0) && (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
              <span className="font-semibold text-zinc-900">
                {searching ? `Iščem po občinah … ${searchPercent} %` : "Iskanje ni dokončano"}
              </span>
              <span className="text-zinc-500">
                {rows.length.toLocaleString("sl-SI")}
                {expectedTotal !== null && ` / ${expectedTotal.toLocaleString("sl-SI")}`} podjetij ·{" "}
                {queriesDone} poizvedb
                {pendingSlices.length > 0 && ` · še ${pendingSlices.length} delov`}
                {searchEtaSeconds !== null && ` · še ~${formatDuration(searchEtaSeconds)}`}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${searchPercent}%` }}
              />
            </div>
          </div>
        )}

        {searchError && <p className="mt-2 text-xs text-red-500">{searchError}</p>}
        {searchNote && <p className="mt-2 text-xs text-zinc-500">{searchNote}</p>}
        {gaps.length > 0 && (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            {gaps.map((g, i) => (
              <p key={i}>{g}</p>
            ))}
          </div>
        )}
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

              <div className="mt-3 w-full max-w-md">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-zinc-900">{percent} %</span>
                  <span className="text-zinc-500">
                    {finishedCount} / {rows.length}
                    {scraping && etaSeconds !== null && ` · še ~${formatDuration(etaSeconds)}`}
                    {scraping && etaSeconds === null && " · računam hitrost …"}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      percent === 100 ? "bg-emerald-500" : "bg-accent"
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </div>
            {!scraping && incomplete.length > 0 && (
              <button
                type="button"
                onClick={scrapeIncomplete}
                title="Ponovno poskusi samo vrstice, ki niso končane ali nimajo nobenega kontakta"
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                <Play className="h-4 w-4" />
                Dokončaj manjkajoče ({incomplete.length})
              </button>
            )}
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
              onClick={() => importSelected(false)}
              disabled={importing || doneCount === 0}
              className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Uvozi v Lead Intelligence
            </button>
            <button
              type="button"
              onClick={() => importSelected(true)}
              disabled={importing || selected.size === 0}
              title="Uvozi tudi še neskrejpana podjetja in jih daj v vrsto, da jih dokonča delovni proces v ozadju"
              className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Uvozi vse in dokončaj v ozadju
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

      {/*
        The background queue. Scraping thousands of companies in this tab is
        days of work that stops the moment the tab closes — and worse, every
        batch is a fresh server call, so the adaptive rate limiter restarts at
        its slowest setting and never learns it can go faster. One long-lived
        local process keeps the AJPES session and lets that limiter converge.
      */}
      {/* What the scrape produced, at a glance. */}
      {rows.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <BarChart3 className="h-4 w-4 text-accent" />
              Statistika skrejpa
            </p>
            <p className="text-xs text-zinc-500">
              {stats.scraped.toLocaleString("sl-SI")} od {stats.found.toLocaleString("sl-SI")} skrejpanih ·
              odstotki so od skrejpanih
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile label="Najdenih podjetij" value={stats.found} tone="zinc" />
            <StatTile label="Skrejpanih" value={stats.scraped} total={stats.found} tone="accent" />
            <StatTile label="Uporabnih (kontakt)" value={stats.reachable} total={stats.scraped} tone="emerald" highlight />
            <StatTile label="Z e-pošto" value={stats.email} total={stats.scraped} tone="emerald" />
            <StatTile label="S telefonom" value={stats.phone} total={stats.scraped} tone="emerald" />
            <StatTile label="S spletno stranjo" value={stats.website} total={stats.scraped} tone="accent" />
            <StatTile label="S kontaktno osebo" value={stats.person} total={stats.scraped} tone="accent" />
            <StatTile label="S prometom" value={stats.revenue} total={stats.scraped} tone="accent" />
            {stats.bankrupt > 0 && (
              <StatTile label="V stečaju" value={stats.bankrupt} total={stats.scraped} tone="red" />
            )}
          </div>
        </div>
      )}

      {/*
        Shown only while the queue actually has work. A panel that stays behind
        after everything finished is just noise above the table.
      */}
      {(queueError || queueBusy) && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Server className="h-4 w-4 text-accent" />
            Obdelava v ozadju
          </p>

          {queueError ? (
            <p className="mt-2 text-xs text-amber-700">
              {queueError} — najverjetneje še ni pognana migracija{" "}
              <code>supabase/migration_enrichment_queue.sql</code>.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-zinc-500">
                Podjetja, uvožena z gumbom „Uvozi vse in dokončaj v ozadju“, dokonča ločen program
                pri vas. Zavihek lahko zaprete — vrsta je v bazi, zato se delo nadaljuje tam, kjer
                se je ustavilo.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Čaka", value: queueCounts!.pending, tone: "text-zinc-900" },
                  { label: "V teku", value: queueCounts!.running, tone: "text-accent" },
                  { label: "Končano", value: queueCounts!.done, tone: "text-emerald-600" },
                  { label: "Napak", value: queueCounts!.failed, tone: "text-red-600" },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl bg-zinc-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">{c.label}</p>
                    <p className={`text-lg font-semibold ${c.tone}`}>{c.value.toLocaleString("sl-SI")}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5">
                <code className="flex-1 font-mono text-xs text-zinc-100">npm run worker</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText("npm run worker");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Kopirano" : "Kopiraj"}
                </button>
              </div>

              <p className="mt-2 text-xs text-zinc-500">
                Poženite v mapi <code>kodatim-si</code>. Program lahko kadar koli ustavite s{" "}
                <kbd className="rounded border border-zinc-300 px-1">Ctrl</kbd>+
                <kbd className="rounded border border-zinc-300 px-1">C</kbd> — nedokončana podjetja
                se vrnejo v vrsto. Za več hitrosti dodajte proxyje v <code>ENRICHMENT_PROXIES</code>{" "}
                (zmogljivost raste sorazmerno z njihovim številom).
                {queueBusy && " Vrsta trenutno ni prazna."}
              </p>
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnPicker((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <Columns3 className="h-4 w-4" />
                Stolpci ({shownColumns.length}/{COLUMNS.length})
              </button>

              {showColumnPicker && (
                <>
                  {/* Clicking anywhere else closes the panel. */}
                  <button
                    type="button"
                    aria-label="Zapri izbirnik stolpcev"
                    onClick={() => setShowColumnPicker(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                <div className="absolute left-0 z-40 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleColumns(COLUMNS.map((c) => c.key))}
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Vse
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleColumns(ESSENTIAL_COLUMNS)}
                      className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Osnovno
                    </button>
                  </div>
                  <div className="mt-2 max-h-80 overflow-y-auto">
                    {COLUMNS.map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(c.key)}
                          onChange={() => toggleColumn(c.key)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
                </>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Tabela drsi levo-desno; podjetje in kljukica ostaneta vidna. Izvoz v CSV vsebuje vse
              stolpce, tudi skrite.
            </p>
          </div>

          {/*
            Scrolls on both axes inside its own box, which is also what makes
            the sticky header and the sticky first columns work — sticky
            positions against the nearest scroll container, so there has to be
            one here rather than the page itself.
          */}
          <div className="max-h-[75vh] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="sticky left-0 top-0 z-30 w-10 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {/*
                    The widths here are not cosmetic: the company column pins
                    itself at left-[6rem], which only lines up if these two
                    really are 2.5rem + 3.5rem. w-14 leaves room for a
                    four-digit row number, since a search can return thousands.
                  */}
                  <th className="sticky left-10 top-0 z-30 w-14 border-b border-zinc-200 bg-zinc-50 px-3 py-2 font-medium">
                    #
                  </th>
                  {shownColumns.map((c, i) => {
                    // The company name rides along on the left so a row is
                    // still identifiable once you have scrolled to Boniteta.
                    const pinned = i === 0 && c.key === "company_name";
                    return (
                      <th
                        key={c.key}
                        className={`whitespace-nowrap border-b border-zinc-200 bg-zinc-50 px-3 py-2 font-medium ${
                          pinned ? "sticky left-[6rem] top-0 z-30" : "sticky top-0 z-20"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="flex items-center gap-1 hover:text-zinc-900"
                          title="Razvrsti po tem stolpcu"
                        >
                          {c.label}
                          <span className={sort?.key === c.key ? "text-accent" : "text-zinc-300"}>
                            {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {displayRows.map(({ row, index }) => {
                  // Opaque, because a sticky cell with a see-through background
                  // shows the columns sliding underneath it.
                  const rowBg = row.status === "error" ? "bg-red-50" : "bg-white";
                  return (
                    <tr key={`${row.detailUrl}-${index}`}>
                      <td className={`sticky left-0 z-10 w-10 px-3 py-2 align-top ${rowBg}`}>
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
                      <td className={`sticky left-10 z-10 w-14 whitespace-nowrap px-3 py-2 align-top text-zinc-400 ${rowBg}`}>
                        {row.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
                        {row.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {row.status === "error" && (
                          <span title={row.error}>
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          </span>
                        )}
                        {row.status === "waiting" && index + 1}
                      </td>
                      {shownColumns.map((c, i) => {
                        const value = valueFor(row, c.key);
                        const isStatus = c.key === "company_status";
                        const isWhy = c.key === "why_missing";
                        const pinned = i === 0 && c.key === "company_name";
                        // The SKD cell's tooltip explains the code instead of
                        // repeating it — the code alone says nothing on hover.
                        const cellTitle =
                          c.key === "skd_code" && value && skdByCode(value)
                            ? `${value} — ${skdByCode(value)!.label}`
                            : value;
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
                            className={`${isWhy || c.key === "description" ? "max-w-[320px]" : "max-w-[220px]"} truncate px-3 py-2 align-top ${tone} ${
                              pinned ? `sticky left-[6rem] z-10 ${rowBg}` : ""
                            }`}
                            title={cellTitle}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
