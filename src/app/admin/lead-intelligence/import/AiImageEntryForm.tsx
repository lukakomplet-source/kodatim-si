"use client";

import { useRef, useState, type FormEvent } from "react";
import { ImageUp, Sparkles, RotateCcw, X, Plus, CheckCircle2, Wand2, Save, ExternalLink } from "lucide-react";
import { createLead } from "../actions";
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, type ImportField } from "@/lib/lead-intelligence/types";
import ContactPersonsField from "./ContactPersonsField";

const MAX_DIMENSION = 2200;
const JPEG_QUALITY = 0.9;
const MAX_IMAGES = 8;

type UploadedImage = { id: string; dataUrl: string };
type LeadFields = Partial<Record<ImportField, string>> & {
  revenue_year?: string;
  revenue_amount?: string;
  skd_code?: string;
  skd_name?: string;
};
type CardStatus = "idle" | "saving" | "saved" | "error";

async function downscaleToJpegDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Slike ni bilo mogoče obdelati.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}


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

export default function AiImageEntryForm() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadFields[] | null>(null);
  const [statuses, setStatuses] = useState<CardStatus[]>([]);
  const [cardErrors, setCardErrors] = useState<(string | null)[]>([]);
  const [lookupLoading, setLookupLoading] = useState<boolean[]>([]);
  const [lookupErrors, setLookupErrors] = useState<(string | null)[]>([]);
  // Optional-provider notices (e.g. Firecrawl out of credits) — informational, never red.
  const [lookupWarnings, setLookupWarnings] = useState<(string | null)[]>([]);
  const [completeLoading, setCompleteLoading] = useState<boolean[]>([]);
  const [completeErrors, setCompleteErrors] = useState<(string | null)[]>([]);
  const [completeWarnings, setCompleteWarnings] = useState<(string | null)[]>([]);
  const [completeSources, setCompleteSources] = useState<(string | null)[]>([]);
  const [fieldSources, setFieldSources] = useState<Record<string, string>[]>([]);
  const [fieldNotes, setFieldNotes] = useState<Record<string, string>[]>([]);
  const [completingAll, setCompletingAll] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRefs = useRef<Record<number, HTMLFormElement | null>>({});

  async function handleFiles(files: FileList | File[]) {
    setExtractError(null);
    const room = Math.max(0, MAX_IMAGES - images.length);
    const list = Array.from(files).slice(0, room);
    const next: UploadedImage[] = [];
    for (const file of list) {
      try {
        const dataUrl = await downscaleToJpegDataUrl(file);
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          dataUrl,
        });
      } catch {
        // skip files that can't be read as images
      }
    }
    setImages((prev) => [...prev, ...next]);
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  async function runExtraction() {
    if (images.length === 0) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/extract-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrls: images.map((img) => img.dataUrl) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setExtractError(json?.error ?? "Prepoznavanje ni uspelo.");
        return;
      }
      const detected: LeadFields[] = Array.isArray(json.leads) ? json.leads : [];
      setLeads(detected);
      setStatuses(detected.map(() => "idle"));
      setCardErrors(detected.map(() => null));
      setLookupLoading(detected.map(() => false));
      setLookupErrors(detected.map(() => null));
      setLookupWarnings(detected.map(() => null));
      setCompleteLoading(detected.map(() => false));
      setCompleteErrors(detected.map(() => null));
      setCompleteWarnings(detected.map(() => null));
      setCompleteSources(detected.map(() => null));
    } catch {
      setExtractError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setExtracting(false);
    }
  }

  function reset() {
    setImages([]);
    setLeads(null);
    setStatuses([]);
    setCardErrors([]);
    setLookupLoading([]);
    setLookupErrors([]);
    setLookupWarnings([]);
    setCompleteLoading([]);
    setCompleteErrors([]);
    setCompleteWarnings([]);
    setCompleteSources([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function saveCard(index: number, formData: FormData) {
    setStatuses((prev) => prev.map((s, i) => (i === index ? "saving" : s)));
    setCardErrors((prev) => prev.map((e, i) => (i === index ? null : e)));

    const result = await createLead({}, formData);

    if (result.error) {
      setStatuses((prev) => prev.map((s, i) => (i === index ? "error" : s)));
      setCardErrors((prev) => prev.map((e, i) => (i === index ? result.error! : e)));
    } else {
      setStatuses((prev) => prev.map((s, i) => (i === index ? "saved" : s)));
    }
  }

  async function handleSaveCard(index: number, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCard(index, new FormData(event.currentTarget));
  }

  async function saveAll() {
    if (!leads) return;
    setSavingAll(true);
    for (let index = 0; index < leads.length; index++) {
      if (statuses[index] === "saved") continue;
      const form = formRefs.current[index];
      if (!form) continue;
      await saveCard(index, new FormData(form));
    }
    setSavingAll(false);
  }

  async function runWebsiteLookup(index: number) {
    const form = formRefs.current[index];
    const websiteInput = form?.elements.namedItem("website") as HTMLInputElement | null;
    const website = websiteInput?.value.trim();
    if (!website) {
      setLookupErrors((prev) => prev.map((e, i) => (i === index ? "Najprej vnesite website." : e)));
      return;
    }

    setLookupLoading((prev) => prev.map((v, i) => (i === index ? true : v)));
    setLookupErrors((prev) => prev.map((e, i) => (i === index ? null : e)));
    setLookupWarnings((prev) => prev.map((e, i) => (i === index ? null : e)));

    try {
      const res = await fetch("/api/admin/lead-intelligence/lookup-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLookupErrors((prev) => prev.map((e, i) => (i === index ? json?.error ?? "Preverjanje ni uspelo." : e)));
        return;
      }
      if (json?.warning) {
        setLookupWarnings((prev) => prev.map((e, i) => (i === index ? json.warning : e)));
        return;
      }

      const industryInput = form?.elements.namedItem("industry") as HTMLInputElement | null;
      if (industryInput && !industryInput.value.trim() && json.industry) {
        industryInput.value = json.industry;
      }
      const phoneInput = form?.elements.namedItem("phone") as HTMLInputElement | null;
      if (phoneInput && !phoneInput.value.trim() && json.phone) {
        phoneInput.value = json.phone;
      }
      const emailInput = form?.elements.namedItem("email") as HTMLInputElement | null;
      if (emailInput && !emailInput.value.trim() && json.email) {
        emailInput.value = json.email;
      }
      const notesInput = form?.elements.namedItem("notes") as HTMLTextAreaElement | null;
      if (notesInput && json.description) {
        const existing = notesInput.value.trim();
        const aiLine = `AI opis: ${json.description}`;
        if (!existing.includes(aiLine)) {
          notesInput.value = existing ? `${existing}\n${aiLine}` : aiLine;
        }
      }
    } catch {
      setLookupErrors((prev) => prev.map((e, i) => (i === index ? "Prišlo je do napake. Poskusite znova." : e)));
    } finally {
      setLookupLoading((prev) => prev.map((v, i) => (i === index ? false : v)));
    }
  }

  async function runAiComplete(index: number) {
    const form = formRefs.current[index];
    const nameInput = form?.elements.namedItem("company_name") as HTMLInputElement | null;
    const companyName = nameInput?.value.trim();
    if (!companyName) {
      setCompleteErrors((prev) => prev.map((e, i) => (i === index ? "Vnesite ime podjetja." : e)));
      return;
    }
    const cityInput = form?.elements.namedItem("address_city") as HTMLInputElement | null;

    setCompleteLoading((prev) => prev.map((v, i) => (i === index ? true : v)));
    setCompleteErrors((prev) => prev.map((e, i) => (i === index ? null : e)));
    setCompleteWarnings((prev) => prev.map((e, i) => (i === index ? null : e)));
    setCompleteSources((prev) => prev.map((s, i) => (i === index ? null : s)));

    try {
      const res = await fetch("/api/admin/lead-intelligence/ai-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, city: cityInput?.value.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCompleteErrors((prev) => prev.map((e, i) => (i === index ? json?.error ?? "Dopolnjevanje ni uspelo." : e)));
        return;
      }
      if (json?.warning) {
        setCompleteWarnings((prev) => prev.map((e, i) => (i === index ? json.warning : e)));
        return;
      }

      const websiteInput = form?.elements.namedItem("website") as HTMLInputElement | null;
      if (websiteInput && !websiteInput.value.trim() && json.website) {
        websiteInput.value = json.website;
      }
      const fieldsToFill = (json.fields ?? {}) as Record<string, string>;
      const returnedSources = (json.sources ?? {}) as Record<string, string>;
      for (const [key, value] of Object.entries(fieldsToFill)) {
        const input = form?.elements.namedItem(key) as HTMLInputElement | null;
        if (!input || !value) continue;
        // Registry data overrides what the image AI guessed; everything else
        // only fills a blank so manual edits are never clobbered.
        if (!input.value.trim() || REGISTRY_AUTHORITATIVE.has(key)) input.value = value;
      }
      setFieldSources((prev) => prev.map((s, i) => (i === index ? returnedSources : s)));
      setFieldNotes((prev) => prev.map((s, i) => (i === index ? ((json.fieldNotes ?? {}) as Record<string, string>) : s)));
      const notesInput = form?.elements.namedItem("notes") as HTMLTextAreaElement | null;
      if (notesInput && json.description) {
        const existing = notesInput.value.trim();
        const aiLine = `AI opis: ${json.description}`;
        if (!existing.includes(aiLine)) {
          notesInput.value = existing ? `${existing}\n${aiLine}` : aiLine;
        }
      }
      setCompleteSources((prev) => prev.map((s, i) => (i === index ? json.source ?? json.website ?? null : s)));
    } catch {
      setCompleteErrors((prev) => prev.map((e, i) => (i === index ? "Prišlo je do napake. Poskusite znova." : e)));
    } finally {
      setCompleteLoading((prev) => prev.map((v, i) => (i === index ? false : v)));
    }
  }

  async function runAiCompleteAll() {
    if (!leads) return;
    setCompletingAll(true);
    for (let index = 0; index < leads.length; index++) {
      if (statuses[index] === "saved") continue;
      await runAiComplete(index);
    }
    setCompletingAll(false);
  }

  const savedCount = statuses.filter((s) => s === "saved").length;
  const allSaved = leads !== null && leads.length > 0 && savedCount === leads.length;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
      <p className="text-sm text-zinc-500">
        Naložite eno ali več slik — fotografije vizitk, screenshote spletnih
        strani ali oglasov. AI prepozna, ali slike pripadajo enemu ali več
        podjetjem, in za vsako podjetje pripravi en lead. Preden shranite, jih
        še preverite.
      </p>

      {leads === null ? (
        <div className="mt-6">
          {images.length > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL preview */}
                  <img
                    src={img.dataUrl}
                    alt="Naložena slika"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Odstrani sliko"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-300 text-zinc-400 hover:border-accent/40 hover:text-accent"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[11px] font-medium">Dodaj</span>
                </button>
              )}
            </div>
          )}

          {images.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
              <ImageUp className="mx-auto h-9 w-9 text-zinc-300" />
              <p className="mt-3 text-sm font-medium text-zinc-900">
                Izberite ali povlecite eno ali več slik
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                JPG, PNG ali WEBP — do {MAX_IMAGES} slik naenkrat
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                Izberi slike
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {extractError && <p className="mt-4 text-sm text-red-500">{extractError}</p>}

          {images.length > 0 && (
            <button
              type="button"
              onClick={runExtraction}
              disabled={extracting}
              className="mt-6 flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {extracting
                ? "Prepoznavam podatke …"
                : `Prepoznaj podatke z AI (${images.length} ${images.length === 1 ? "slika" : "slik"})`}
            </button>
          )}
        </div>
      ) : (
        <div className="relative mt-6 space-y-6">
          {(completingAll || savingAll) && (
            <div className="sticky top-4 z-10 -mb-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-accent/20 bg-white/90 py-8 shadow-lg backdrop-blur-sm">
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-accent/15 border-t-accent" />
              </div>
              <p className="text-sm font-medium text-zinc-700">
                {completingAll ? "AI dopolnjuje vse tabele …" : "Shranjujem vse leade …"}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Sparkles className="h-3.5 w-3.5" />
              AI je iz {images.length} {images.length === 1 ? "slike" : "slik"} zaznal{" "}
              {leads.length} {leads.length === 1 ? "podjetje" : "podjetij"}.
            </p>
            <div className="flex flex-shrink-0 items-center gap-3">
              {!allSaved && (
                <button
                  type="button"
                  onClick={runAiCompleteAll}
                  disabled={completingAll}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {completingAll ? "Dopolnjujem vse …" : "AI dopolni vse tabele"}
                </button>
              )}
              {!allSaved && (
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={savingAll}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingAll ? "Shranjujem vse …" : "Shrani vse leade"}
                </button>
              )}
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Začni znova
              </button>
            </div>
          </div>

          {allSaved && (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Vsi leadi so shranjeni.
            </p>
          )}

          {leads.map((fields, index) => {
            const saved = statuses[index] === "saved";
            return (
              <form
                key={index}
                ref={(el) => {
                  formRefs.current[index] = el;
                }}
                onSubmit={(e) => handleSaveCard(index, e)}
                className="rounded-2xl border border-zinc-200 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Podjetje {index + 1} od {leads.length}
                  </p>
                  {saved ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Shranjeno
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => runAiComplete(index)}
                      disabled={completeLoading[index]}
                      className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      {completeLoading[index] ? "Iščem po spletu …" : "AI dopolni vse"}
                    </button>
                  )}
                </div>
                {fields.company_name && (
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`site:bizi.si ${fields.company_name}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-accent hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Bizi
                    </a>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`site:companywall.si ${fields.company_name}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-accent hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      CompanyWall
                    </a>
                  </div>
                )}
                {completeErrors[index] && (
                  <p className="mt-1 text-xs text-red-500">{completeErrors[index]}</p>
                )}
                {completeWarnings[index] && (
                  <p className="mt-1 text-xs text-amber-600">{completeWarnings[index]}</p>
                )}
                {completeSources[index] && (
                  <p className="mt-1 text-xs text-emerald-600">
                    Dopolnjeno na podlagi: {completeSources[index]}. Preverite podatke pred shranjevanjem.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                              name={field}
                              defaultValue={fields[field] ?? ""}
                              disabled={saved}
                              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                            />
                            {!saved && (
                              <button
                                type="button"
                                onClick={() => runWebsiteLookup(index)}
                                disabled={lookupLoading[index]}
                                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                {lookupLoading[index] ? "Preverjam …" : "Preveri z AI"}
                              </button>
                            )}
                          </div>
                          {lookupErrors[index] && (
                            <p className="mt-1 text-xs text-red-500">{lookupErrors[index]}</p>
                          )}
                          {lookupWarnings[index] && (
                            <p className="mt-1 text-xs text-amber-600">{lookupWarnings[index]}</p>
                          )}
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
                            name={field}
                            rows={2}
                            defaultValue={fields[field] ?? ""}
                            disabled={saved}
                            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                          />
                        ) : (
                          <input
                            name={field}
                            required={field === "company_name"}
                            defaultValue={fields[field] ?? ""}
                            disabled={saved}
                            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                          />
                        )}
                        {/* Where the value came from, or why it stayed empty. */}
                        {fieldSources[index]?.[field] ? (
                          <p className="mt-0.5 text-[11px] text-emerald-600">vir: {fieldSources[index][field]}</p>
                        ) : fieldNotes[index]?.[field] ? (
                          <p className="mt-0.5 text-[11px] text-zinc-400">{fieldNotes[index][field]}</p>
                        ) : null}
                      </div>
                    );
                  })}

                  <div className="sm:col-span-2">
                    <ContactPersonsField defaultValue={fields.contact_person} disabled={saved} />
                  </div>

                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      SKD koda
                    </label>
                    <input
                      name="skd_code"
                      defaultValue={fields.skd_code ?? ""}
                      disabled={saved}
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      SKD naziv dejavnosti
                    </label>
                    <input
                      name="skd_name"
                      defaultValue={fields.skd_name ?? ""}
                      disabled={saved}
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Leto (prihodki)
                    </label>
                    <input
                      name="revenue_year"
                      type="number"
                      defaultValue={fields.revenue_year ?? ""}
                      disabled={saved}
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Letni prihodki (€)
                    </label>
                    <input
                      name="revenue_amount"
                      type="number"
                      defaultValue={fields.revenue_amount ?? ""}
                      disabled={saved}
                      className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                    />
                  </div>
                </div>

                {!saved && (
                  <div className="mt-4">
                    <button
                      type="submit"
                      disabled={statuses[index] === "saving"}
                      className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {statuses[index] === "saving" ? "Shranjujem …" : "Shrani lead"}
                    </button>
                    {cardErrors[index] && (
                      <p className="mt-2 text-sm text-red-500">{cardErrors[index]}</p>
                    )}
                  </div>
                )}
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
