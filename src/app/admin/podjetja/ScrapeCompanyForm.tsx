"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { scrapeCompany, type ScrapeCompanyState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Analiziram …" : "Dodaj podjetje"}
    </button>
  );
}

const initialState: ScrapeCompanyState = {};

export default function ScrapeCompanyForm() {
  const [state, formAction] = useActionState(scrapeCompany, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label className="text-sm font-medium text-zinc-700">
          URL podjetja
        </label>
        <input
          name="url"
          required
          placeholder="npr. kontex.si"
          className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
      </div>
      <SubmitButton />
      {state.error && (
        <p className="text-sm text-red-500 sm:basis-full">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-600 sm:basis-full">
          Podjetje je dodano.
        </p>
      )}
    </form>
  );
}
