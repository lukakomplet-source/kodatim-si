"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Upload, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  type ImportField,
} from "@/lib/lead-intelligence/types";
import { suggestMapping } from "@/lib/lead-intelligence/import-mapping";

type Step = "upload" | "mapping" | "importing" | "done";

const CHUNK_SIZE = 500;

function sourceFromFilename(name: string): "csv" | "xlsx" | "xls" {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xls") return "xls";
  return "xlsx";
}

export default function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const [progress, setProgress] = useState({ sent: 0, inserted: 0, skipped: 0 });
  const [importId, setImportId] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setParseError(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });

      if (rows.length < 2) {
        setParseError("Datoteka ne vsebuje podatkovnih vrstic.");
        return;
      }

      const hdrs = rows[0].map((h) => String(h ?? "").trim());
      const body = rows
        .slice(1)
        .filter((r) => r.some((c) => String(c ?? "").trim()))
        .map((r) => hdrs.map((_, i) => String(r[i] ?? "")));

      setFilename(file.name);
      setHeaders(hdrs);
      setDataRows(body);
      setMapping(suggestMapping(hdrs));
      setStep("mapping");
    } catch {
      setParseError("Datoteke ni bilo mogoče prebrati. Preverite format (.csv, .xlsx, .xls).");
    }
  }

  async function startImport() {
    setStep("importing");
    setProgress({ sent: 0, inserted: 0, skipped: 0 });

    const rowsAsObjects = dataRows.map((row) => {
      const obj: Partial<Record<ImportField, string>> = {};
      mapping.forEach((field, i) => {
        if (field && row[i]) obj[field] = row[i];
      });
      return obj;
    });

    let currentImportId: string | undefined;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < rowsAsObjects.length; i += CHUNK_SIZE) {
      const chunk = rowsAsObjects.slice(i, i + CHUNK_SIZE);
      const isFirstChunk = i === 0;
      const isLastChunk = i + CHUNK_SIZE >= rowsAsObjects.length;

      const res = await fetch("/api/admin/lead-intelligence/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId: currentImportId,
          filename,
          source: sourceFromFilename(filename),
          rows: chunk,
          isFirstChunk,
          isLastChunk,
          totalRows: rowsAsObjects.length,
        }),
      });

      if (!res.ok) {
        setParseError("Uvoz je prekinjen zaradi napake na strežniku.");
        break;
      }

      const json = await res.json();
      currentImportId = json.importId;
      inserted += json.inserted ?? 0;
      skipped += json.skipped ?? 0;
      setProgress({ sent: Math.min(i + CHUNK_SIZE, rowsAsObjects.length), inserted, skipped });
    }

    setImportId(currentImportId);
    setStep("done");
  }

  if (step === "upload") {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
        <Upload className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-4 text-base font-medium text-zinc-900">
          Naložite CSV ali Excel datoteko
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Podprti formati: .csv, .xlsx, .xls
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-6 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Izberi datoteko
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {parseError && <p className="mt-4 text-sm text-red-500">{parseError}</p>}
      </div>
    );
  }

  if (step === "mapping") {
    return (
      <div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            Mapiranje stolpcev — {filename}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {dataRows.length} vrstic zaznanih. Preverite samodejno mapiranje in
            po potrebi popravite.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Stolpec v datoteki</th>
                  <th className="px-3 py-2">Primer</th>
                  <th className="px-3 py-2">Mapira se v</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {headers.map((h, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium text-zinc-900">{h || `Stolpec ${i + 1}`}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-zinc-500">
                      {dataRows[0]?.[i] || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => {
                          const value = (e.target.value || null) as ImportField | null;
                          setMapping((prev) => prev.map((m, idx) => (idx === i ? value : m)));
                        }}
                        className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                      >
                        <option value="">Ne uvozi</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {IMPORT_FIELD_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!mapping.includes("company_name") && (
            <p className="mt-4 text-sm text-amber-600">
              Vsaj en stolpec morate mapirati na &quot;Ime podjetja&quot;.
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Nazaj
            </button>
            <button
              type="button"
              disabled={!mapping.includes("company_name")}
              onClick={startImport}
              className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              Uvozi {dataRows.length} vrstic
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "importing") {
    const pct = dataRows.length
      ? Math.round((progress.sent / dataRows.length) * 100)
      : 0;
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <p className="text-lg font-semibold text-zinc-900">Uvažam leade …</p>
        <div className="mx-auto mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          {progress.sent} / {dataRows.length} — dodanih {progress.inserted}, preskočenih (duplikati) {progress.skipped}
        </p>
        {parseError && <p className="mt-3 text-sm text-red-500">{parseError}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
      <p className="mt-4 text-lg font-semibold text-zinc-900">Uvoz zaključen</p>
      <p className="mt-1 text-sm text-zinc-500">
        Dodanih {progress.inserted} novih leadov, preskočenih {progress.skipped} (že v bazi).
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          href={`/admin/lead-intelligence/discovery${importId ? `?importId=${importId}` : ""}`}
          className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Nadaljuj v AI Discovery vrsto
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/admin/lead-intelligence/leads"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          Odpri bazo leadov →
        </Link>
      </div>
    </div>
  );
}
