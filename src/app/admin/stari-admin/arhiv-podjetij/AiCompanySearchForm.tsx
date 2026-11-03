"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  aiFindCompany,
  saveCompany,
  type AiFindCompanyState,
  type CompanyPreview,
} from "./actions";

function SearchButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
    >
      <Sparkles className="h-4 w-4" />
      {pending ? "Iščem …" : "Poišči z AI"}
    </button>
  );
}

const initialState: AiFindCompanyState = {};

export default function AiCompanySearchForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(aiFindCompany, initialState);
  const [preview, setPreview] = useState<CompanyPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (state.result && state.result !== preview && !saved) {
    setPreview(state.result);
    setSaveError(null);
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveCompany(preview);
    setSaving(false);
    if (res.error) {
      setSaveError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Iskanje z AI</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Opišite, kakšno podjetje iščete (npr. &quot;odvoz odpadkov v
        Celju&quot;) — AI ga poišče na spletu in prepozna.
      </p>
      <form
        action={(formData) => {
          setPreview(null);
          setSaved(false);
          formAction(formData);
        }}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <input
            name="query"
            required
            placeholder="npr. odvoz odpadkov v Celju"
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <SearchButton />
      </form>
      {state.error && (
        <p className="mt-3 text-sm text-red-500">{state.error}</p>
      )}

      {preview && (
        <div className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            Najdeno podjetje
          </p>
          <p className="mt-2 text-base font-semibold text-zinc-900">
            {preview.name}
          </p>
          <span className="mt-1 inline-block rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
            {preview.industry}
          </span>
          <p className="mt-2 text-sm text-zinc-600">{preview.description}</p>
          <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            {(() => {
              try {
                return new URL(preview.url).hostname;
              } catch {
                return preview.url;
              }
            })()}
          </a>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {saved ? "Dodano ✓" : saving ? "Dodajam …" : "Dodaj podjetje"}
            </button>
            {saveError && (
              <p className="text-sm text-red-500">{saveError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
