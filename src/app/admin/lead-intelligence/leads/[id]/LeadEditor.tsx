"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2, Wand2 } from "lucide-react";
import type { IntelLead, LeadStatus, LeadPriority } from "@/lib/lead-intelligence/types";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
} from "@/lib/lead-intelligence/types";
import type { EnrichmentFieldMeta } from "@/lib/enrichment/types";
import type { IntelLeadContact } from "@/lib/lead-intelligence/contactTypes";
import { REGISTRY_FIELDS, REGISTRY_FIELD_LABELS } from "@/lib/publicEnrichment/types";
import {
  updateLead,
  updateStatus,
  updatePriority,
  setReminderDate,
  markContacted,
  moveToCustomer,
  addNote,
  assignTags,
  deleteLead,
  type UpdateLeadFields,
} from "../../actions";
import ContactPersonsField from "../../import/ContactPersonsField";
import EnrichmentStatusBadge from "@/components/ui/EnrichmentStatusBadge";
import FieldProvenance from "./FieldProvenance";
import ContactsSection from "./ContactsSection";
import PublicEnrichmentBadges from "./PublicEnrichmentBadges";

const FIELD_LABELS: Record<string, string> = {
  company_name: "Ime podjetja",
  industry: "Panoga",
  website: "Website",
  email: "Email",
  phone: "Telefon",
  address_street: "Ulica",
  address_city: "Mesto",
  address_region: "Regija",
  address_country: "Država",
  vat_id: "ID za DDV",
};

const TEXT_FIELDS = Object.keys(FIELD_LABELS) as (keyof UpdateLeadFields)[];
const CUSTOM_FIELD_KEYS = ["revenue_year", "revenue_amount", "skd_code", "skd_name"];

export default function LeadEditor({
  lead,
  contacts,
}: {
  lead: IntelLead;
  contacts: IntelLeadContact[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const contactsRef = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f, (lead[f as keyof IntelLead] as string) ?? ""]))
  );
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [tagsText, setTagsText] = useState((lead.tags ?? []).join(", "));
  const [revenueYear, setRevenueYear] = useState(lead.custom_fields?.revenue_year ?? "");
  const [revenueAmount, setRevenueAmount] = useState(lead.custom_fields?.revenue_amount ?? "");
  const [skdCode, setSkdCode] = useState(lead.custom_fields?.skd_code ?? "");
  const [skdName, setSkdName] = useState(lead.custom_fields?.skd_name ?? "");
  const [customFields, setCustomFields] = useState<[string, string][]>(
    Object.entries(lead.custom_fields ?? {}).filter(([k]) => !CUSTOM_FIELD_KEYS.includes(k))
  );
  const [reminder, setReminder] = useState(lead.reminder_date ?? "");
  const [noteDraft, setNoteDraft] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [registryValues, setRegistryValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(REGISTRY_FIELDS.map((f) => [f, lead.custom_fields?.[f] ?? ""]))
  );
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function fieldMeta(field: string): EnrichmentFieldMeta | undefined {
    return (lead.enrichment_meta as Record<string, EnrichmentFieldMeta> | undefined)?.[field];
  }

  function fieldMetaWithUrl(field: string): { meta: EnrichmentFieldMeta | undefined; sourceUrl: string | null } {
    const meta = fieldMeta(field);
    const sourceUrl = (meta as unknown as { source_url?: string | null } | undefined)?.source_url ?? null;
    return { meta, sourceUrl };
  }

  async function runEnrichment() {
    setEnrichLoading(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/enrichment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        setEnrichError("AI obogatitev ni uspela.");
        return;
      }
      router.refresh();
    } catch {
      setEnrichError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setEnrichLoading(false);
    }
  }

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        alert(result.error);
      } else {
        setSavedAt(Date.now());
        router.refresh();
      }
    });
  }

  function handleSaveProfile() {
    const contactPersons = Array.from(
      contactsRef.current?.querySelectorAll<HTMLInputElement>('input[name="contact_person"]') ?? []
    )
      .map((el) => el.value.trim())
      .filter(Boolean);

    const payload: UpdateLeadFields = {
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, fields[f] || null])),
      contact_person: contactPersons.length ? contactPersons.join(", ") : null,
      notes: notes || null,
      custom_fields: {
        ...Object.fromEntries(customFields.filter(([k]) => k.trim())),
        ...(revenueYear ? { revenue_year: revenueYear } : {}),
        ...(revenueAmount ? { revenue_amount: revenueAmount } : {}),
        ...(skdCode ? { skd_code: skdCode } : {}),
        ...(skdName ? { skd_name: skdName } : {}),
        ...Object.fromEntries(Object.entries(registryValues).filter(([, v]) => v.trim())),
      },
    };
    run(() => updateLead(lead.id, payload));
    run(() => assignTags(lead.id, tagsText.split(",").map((t) => t.trim())));
  }

  function handleDelete() {
    if (!confirm(`Izbrisati "${lead.company_name}"? Tega ni mogoče razveljaviti.`)) return;
    startTransition(async () => {
      const result = await deleteLead(lead.id);
      if (result.error) {
        alert(result.error);
      } else {
        router.push("/admin/lead-intelligence/leads");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900">
              {lead.company_name}
            </h1>
            <EnrichmentStatusBadge status={lead.enrichment_status} />
          </div>
          <div className="flex items-center gap-2">
            {lead.website && (
              <a
                href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Odpri website
              </a>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => markContacted(lead.id))}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Označi kot kontaktiran
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => moveToCustomer(lead.id))}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Premakni med stranke
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Izbriši
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/[0.04] px-4 py-3">
          <p className="text-xs text-zinc-600">
            AI Discovery poišče spletno stran, prebere vsebino in dopolni prazna polja
            (website, email, telefon, naslov, panoga) — vsaka najdena vrednost dobi viden
            vir in zanesljivost spodaj.
          </p>
          <button
            type="button"
            onClick={runEnrichment}
            disabled={enrichLoading}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {enrichLoading ? "Obogatujem …" : "Osveži AI obogatitev"}
          </button>
        </div>
        {enrichError && <p className="mt-2 text-xs text-red-500">{enrichError}</p>}

        <PublicEnrichmentBadges enrichmentMeta={lead.enrichment_meta as Record<string, { source?: string | null }>} />

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => {
            const { meta, sourceUrl } = fieldMetaWithUrl(f);
            return (
              <div key={f}>
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {FIELD_LABELS[f]}
                </label>
                <input
                  ref={(el) => {
                    fieldRefs.current[f] = el;
                  }}
                  value={fields[f]}
                  onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
                />
                <FieldProvenance
                  meta={meta}
                  sourceUrl={sourceUrl}
                  onFocusField={() => fieldRefs.current[f]?.focus()}
                />
              </div>
            );
          })}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              SKD koda
            </label>
            <input
              value={skdCode}
              onChange={(e) => setSkdCode(e.target.value)}
              placeholder="npr. 62.010"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              SKD naziv dejavnosti
            </label>
            <input
              value={skdName}
              onChange={(e) => setSkdName(e.target.value)}
              placeholder="npr. Računalniško programiranje"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Leto prihodkov
            </label>
            <input
              value={revenueYear}
              onChange={(e) => setRevenueYear(e.target.value)}
              placeholder="npr. 2026"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Letni prihodki (€)
            </label>
            <input
              value={revenueAmount}
              onChange={(e) => setRevenueAmount(e.target.value)}
              placeholder="npr. 120000"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>

        <div ref={contactsRef} className="mt-4">
          <ContactPersonsField defaultValue={lead.contact_person ?? undefined} />
        </div>

        <ContactsSection leadId={lead.id} contacts={contacts} />

        <div className="mt-4">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Opombe
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Oznake (ločene z vejico)
          </label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Dodatna polja
            </label>
            <button
              type="button"
              onClick={() => setCustomFields((prev) => [...prev, ["", ""]])}
              className="flex items-center gap-1 text-xs font-medium text-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Dodaj polje
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {customFields.map(([key, value], i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={key}
                  placeholder="ključ"
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((row, idx) => (idx === i ? [e.target.value, row[1]] : row))
                    )
                  }
                  className="w-1/3 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                />
                <input
                  value={value}
                  placeholder="vrednost"
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((row, idx) => (idx === i ? [row[0], e.target.value] : row))
                    )
                  }
                  className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCustomFields((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveProfile}
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {isPending ? "Shranjujem …" : "Shrani spremembe"}
          </button>
          {savedAt && (
            <span className="text-sm text-emerald-600">Shranjeno.</span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">CRM podatki</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Status
            </label>
            <select
              defaultValue={lead.lead_status}
              disabled={isPending}
              onChange={(e) => run(() => updateStatus(lead.id, e.target.value as LeadStatus))}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Prioriteta
            </label>
            <select
              defaultValue={lead.priority}
              disabled={isPending}
              onChange={(e) => run(() => updatePriority(lead.id, e.target.value as LeadPriority))}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            >
              {LEAD_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {LEAD_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Datum opomnika
            </label>
            <input
              type="date"
              value={reminder}
              disabled={isPending}
              onChange={(e) => {
                setReminder(e.target.value);
                run(() => setReminderDate(lead.id, e.target.value || null));
              }}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Hitra opomba
          </label>
          <div className="mt-1 flex gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="npr. Poklical, zanima jih ponudba …"
              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
            />
            <button
              type="button"
              disabled={isPending || !noteDraft.trim()}
              onClick={() => {
                run(() => addNote(lead.id, noteDraft));
                setNoteDraft("");
              }}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Dodaj
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Javni registri</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Podatki, ki jih je AI Discovery samodejno poiskal iz javno dostopnih virov (CompanyWall, Bizi.si,
          Google in drugi).
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {REGISTRY_FIELDS.map((f) => {
            const { meta, sourceUrl } = fieldMetaWithUrl(f);
            return (
              <div key={f}>
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {REGISTRY_FIELD_LABELS[f]}
                </label>
                <input
                  value={registryValues[f] ?? ""}
                  onChange={(e) => setRegistryValues((prev) => ({ ...prev, [f]: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
                />
                <FieldProvenance meta={meta} sourceUrl={sourceUrl} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
