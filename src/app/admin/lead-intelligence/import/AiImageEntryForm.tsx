"use client";

import { useRef, useState, type FormEvent } from "react";
import { ImageUp, Sparkles, RotateCcw, X, Plus, CheckCircle2 } from "lucide-react";
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSaveCard(index: number, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
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
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Sparkles className="h-3.5 w-3.5" />
              AI je iz {images.length} {images.length === 1 ? "slike" : "slik"} zaznal{" "}
              {leads.length} {leads.length === 1 ? "podjetje" : "podjetij"}.
            </p>
            <button
              type="button"
              onClick={reset}
              className="flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Začni znova
            </button>
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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Podjetje {index + 1} od {leads.length}
                  </p>
                  {saved && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Shranjeno
                    </span>
                  )}
                </div>

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
                      </div>
                    );
                  })}

                  <div className="sm:col-span-2">
                    <ContactPersonsField defaultValue={fields.contact_person} disabled={saved} />
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
