"use client";

import { useActionState, useRef, useState, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles, Wand2 } from "lucide-react";
import { createLead, type CreateLeadState } from "../actions";
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, type ImportField } from "@/lib/lead-intelligence/types";
import ContactPersonsField from "./ContactPersonsField";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Shranjujem …" : "Dodaj lead"}
    </button>
  );
}

const initialState: CreateLeadState = {};


/**
 * Fields an official registry (AJPES/CompanyWall/Bizi) knows better than an
 * AI reading a photo. OCR of a scanned list produced a phone number that was
 * actually the VAT number, and enrichment used to only fill EMPTY inputs, so
 * such a value could never be corrected. For these fields the registry wins.
 */
const REGISTRY_AUTHORITATIVE = new Set([
  "vat_id",
  "registration_number",
  "address_street",
  "address_city",
  "address_region",
  "address_country",
  "phone",
  "email",
  "industry",
  "skd_code",
  "skd_name",
]);

const SKIP_DEFAULT_RENDER: ImportField[] = ["contact_person"];

type FieldRefs = Partial<Record<ImportField, RefObject<HTMLInputElement | null>>>;

export default function ManualEntryForm() {
  const [state, formAction] = useActionState(createLead, initialState);

  const companyNameRef = useRef<HTMLInputElement>(null);
  const websiteRef = useRef<HTMLInputElement>(null);
  const industryRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const streetRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLInputElement>(null);
  const vatRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const fieldRefs: FieldRefs = {
    industry: industryRef,
    phone: phoneRef,
    email: emailRef,
    address_street: streetRef,
    address_city: cityRef,
    address_region: regionRef,
    address_country: countryRef,
    vat_id: vatRef,
  };

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // Optional-provider notices (e.g. Firecrawl out of credits) — informational, never red.
  const [lookupWarning, setLookupWarning] = useState<string | null>(null);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completeWarning, setCompleteWarning] = useState<string | null>(null);
  const [completeSource, setCompleteSource] = useState<string | null>(null);
  // Which source filled each field, and why the rest stayed empty — so the
  // form can explain itself instead of just failing silently.
  const [fieldSources, setFieldSources] = useState<Record<string, string>>({});
  const [fieldNotes, setFieldNotes] = useState<Record<string, string>>({});
  const [providerNotes, setProviderNotes] = useState<{ label: string; note: string }[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [noWebsite, setNoWebsite] = useState(false);

  function toggleNoWebsite(checked: boolean) {
    setNoWebsite(checked);
    if (checked && websiteRef.current) websiteRef.current.value = "";
  }

  async function runWebsiteLookup() {
    const website = websiteRef.current?.value.trim();
    if (!website) {
      setLookupError("Najprej vnesite website.");
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupWarning(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/lookup-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLookupError(json?.error ?? "Preverjanje ni uspelo.");
        return;
      }
      if (json?.warning) {
        setLookupWarning(json.warning);
        return;
      }
      if (industryRef.current && !industryRef.current.value.trim() && json.industry) {
        industryRef.current.value = json.industry;
      }
      if (phoneRef.current && !phoneRef.current.value.trim() && json.phone) {
        phoneRef.current.value = json.phone;
      }
      if (emailRef.current && !emailRef.current.value.trim() && json.email) {
        emailRef.current.value = json.email;
      }
      if (notesRef.current && json.description) {
        const existing = notesRef.current.value.trim();
        const aiLine = `AI opis: ${json.description}`;
        if (!existing.includes(aiLine)) {
          notesRef.current.value = existing ? `${existing}\n${aiLine}` : aiLine;
        }
      }
      setNoWebsite(false);
    } catch {
      setLookupError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function runAiComplete() {
    const companyName = companyNameRef.current?.value.trim();
    if (!companyName) {
      setCompleteError("Najprej vnesite ime podjetja.");
      return;
    }
    setCompleteLoading(true);
    setCompleteError(null);
    setCompleteWarning(null);
    setCompleteSource(null);
    setFieldSources({});
    setFieldNotes({});
    setProviderNotes([]);
    try {
      const res = await fetch("/api/admin/lead-intelligence/ai-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, city: cityRef.current?.value.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCompleteError(json?.error ?? "Dopolnjevanje ni uspelo.");
        if (res.status === 422) setNoWebsite(true);
        return;
      }
      setFieldSources((json.sources ?? {}) as Record<string, string>);
      setFieldNotes((json.fieldNotes ?? {}) as Record<string, string>);
      setProviderNotes((json.providerNotes ?? []) as { label: string; note: string }[]);

      if (json?.warning) {
        setCompleteWarning(json.warning);
        return;
      }

      if (websiteRef.current && !websiteRef.current.value.trim() && json.website) {
        websiteRef.current.value = json.website;
      }
      if (json.website) setNoWebsite(false);
      const fields = (json.fields ?? {}) as Record<string, string>;
      for (const [key, ref] of Object.entries(fieldRefs)) {
        const value = fields[key];
        if (!ref?.current || !value) continue;
        // Registry data overrides a guessed value; otherwise only fill blanks.
        if (!ref.current.value.trim() || REGISTRY_AUTHORITATIVE.has(key)) {
          ref.current.value = value;
        }
      }
      if (notesRef.current && json.description) {
        const existing = notesRef.current.value.trim();
        const aiLine = `AI opis: ${json.description}`;
        if (!existing.includes(aiLine)) {
          notesRef.current.value = existing ? `${existing}\n${aiLine}` : aiLine;
        }
      }
      setCompleteSource(json.source ?? json.website ?? null);
    } catch {
      setCompleteError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setCompleteLoading(false);
    }
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/[0.04] px-4 py-3">
        <p className="text-xs text-zinc-600">
          Vnesite ime podjetja (in po možnosti mesto), nato naj AI poišče
          website, email, telefon, naslov in panogo po spletu.
        </p>
        <button
          type="button"
          onClick={runAiComplete}
          disabled={completeLoading}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" />
          {completeLoading ? "Iščem po spletu …" : "AI dopolni vse"}
        </button>
      </div>
      {completeError && (
        <p className="sm:col-span-2 text-xs text-red-500">{completeError}</p>
      )}
      {completeWarning && (
        <p className="sm:col-span-2 text-xs text-amber-600">{completeWarning}</p>
      )}
      {completeSource && (
        <p className="sm:col-span-2 text-xs text-emerald-600">
          Dopolnjeno na podlagi: {completeSource}. Preverite podatke pred shranjevanjem.
        </p>
      )}
      {providerNotes.length > 0 && (
        <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5 text-xs">
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="font-medium text-zinc-600 hover:text-zinc-900"
          >
            {showNotes ? "Skrij" : "Pokaži"} podrobnosti po virih ({providerNotes.length})
          </button>
          {showNotes && (
            <div className="mt-2 space-y-2">
              <ul className="space-y-0.5">
                {providerNotes.map((p, i) => (
                  <li key={`${p.label}-${i}`} className="text-zinc-600">
                    <span className="font-medium text-zinc-700">{p.label}:</span> {p.note}
                  </li>
                ))}
              </ul>
              {Object.keys(fieldNotes).length > 0 && (
                <div>
                  <div className="mb-0.5 font-medium text-zinc-600">Zakaj je polje ostalo prazno</div>
                  <ul className="space-y-0.5">
                    {Object.entries(fieldNotes).map(([field, reason]) => (
                      <li key={field} className="text-zinc-500">
                        <span className="font-medium text-zinc-700">{IMPORT_FIELD_LABELS[field as ImportField] ?? field}</span> — {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {IMPORT_FIELDS.map((field) => {
        if (SKIP_DEFAULT_RENDER.includes(field)) return null;

        if (field === "website") {
          return (
            <div key={field}>
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {IMPORT_FIELD_LABELS[field]}
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  ref={websiteRef}
                  name={field}
                  placeholder="npr. podjetje.si"
                  disabled={noWebsite}
                  className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                />
                <button
                  type="button"
                  onClick={runWebsiteLookup}
                  disabled={lookupLoading || noWebsite}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {lookupLoading ? "Preverjam …" : "Preveri z AI"}
                </button>
              </div>
              {lookupError && <p className="mt-1 text-xs text-red-500">{lookupError}</p>}
              {lookupWarning && <p className="mt-1 text-xs text-amber-600">{lookupWarning}</p>}
              <label className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  checked={noWebsite}
                  onChange={(e) => toggleNoWebsite(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 accent-accent"
                />
                Podjetje nima spletne strani
              </label>
            </div>
          );
        }

        return (
          <div key={field} className={field === "notes" ? "sm:col-span-2" : undefined}>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {IMPORT_FIELD_LABELS[field]}
              {field === "company_name" && " *"}
            </label>
            {field === "notes" ? (
              <textarea
                ref={notesRef}
                name={field}
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
              />
            ) : (
              <input
                ref={field === "company_name" ? companyNameRef : fieldRefs[field]}
                name={field}
                required={field === "company_name"}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
              />
            )}
            {/* Where the value came from, or why it stayed empty — visible per field. */}
            {fieldSources[field] ? (
              <p className="mt-0.5 text-[11px] text-emerald-600">vir: {fieldSources[field]}</p>
            ) : fieldNotes[field] ? (
              <p className="mt-0.5 text-[11px] text-zinc-400">{fieldNotes[field]}</p>
            ) : null}
          </div>
        );
      })}

      <div className="sm:col-span-2">
        <ContactPersonsField />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          SKD koda *
        </label>
        <input
          name="skd_code"
          required
          placeholder="npr. 62.010"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          SKD naziv dejavnosti
        </label>
        <input
          name="skd_name"
          placeholder="npr. Računalniško programiranje"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Leto (prihodki)
        </label>
        <input
          name="revenue_year"
          type="number"
          placeholder="npr. 2026"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Letni prihodki (€)
        </label>
        <input
          name="revenue_amount"
          type="number"
          placeholder="npr. 120000"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>

      <div className="sm:col-span-2">
        <SubmitButton />
        {state.error && <p className="mt-2 text-sm text-red-500">{state.error}</p>}
        {state.success && (
          <p className="mt-2 text-sm text-emerald-600">Lead je dodan.</p>
        )}
      </div>
    </form>
  );
}
