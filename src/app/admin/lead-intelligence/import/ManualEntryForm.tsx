"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";
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

const SKIP_DEFAULT_RENDER: ImportField[] = ["contact_person"];

export default function ManualEntryForm() {
  const [state, formAction] = useActionState(createLead, initialState);

  const websiteRef = useRef<HTMLInputElement>(null);
  const industryRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  async function runWebsiteLookup() {
    const website = websiteRef.current?.value.trim();
    if (!website) {
      setLookupError("Najprej vnesite website.");
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
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
    } catch {
      setLookupError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={runWebsiteLookup}
                  disabled={lookupLoading}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {lookupLoading ? "Preverjam …" : "Preveri z AI"}
                </button>
              </div>
              {lookupError && <p className="mt-1 text-xs text-red-500">{lookupError}</p>}
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
                ref={
                  field === "industry"
                    ? industryRef
                    : field === "phone"
                      ? phoneRef
                      : field === "email"
                        ? emailRef
                        : undefined
                }
                name={field}
                required={field === "company_name"}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
              />
            )}
          </div>
        );
      })}

      <div className="sm:col-span-2">
        <ContactPersonsField />
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
