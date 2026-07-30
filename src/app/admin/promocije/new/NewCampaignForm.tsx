"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createCampaign, type CreateCampaignState } from "../actions";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/promocije/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Ustvarjam …" : "Ustvari kampanjo"}
    </button>
  );
}

const initialState: CreateCampaignState = {};

const FIELDS: { name: string; label: string; placeholder?: string }[] = [
  { name: "target_industry", label: "Ciljna panoga", placeholder: "npr. Avtomobilski saloni" },
  { name: "target_country", label: "Ciljna država", placeholder: "npr. Slovenija" },
  { name: "target_city", label: "Ciljno mesto", placeholder: "npr. Ljubljana" },
  { name: "company_size", label: "Velikost podjetja", placeholder: "npr. mikro, malo, srednje" },
  { name: "employee_count", label: "Št. zaposlenih", placeholder: "npr. 10-50" },
  { name: "revenue_range", label: "Razpon prihodkov", placeholder: "npr. 100k-500k €" },
  { name: "company_status", label: "Status podjetja", placeholder: "npr. aktivno, novo" },
  { name: "lead_source", label: "Vir leadov", placeholder: "npr. Lead Intelligence" },
];

export default function NewCampaignForm() {
  const [state, formAction] = useActionState(createCampaign, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.campaignId) {
      router.push(`/admin/promocije/${state.campaignId}`);
    }
  }, [state.campaignId, router]);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Ime kampanje *
        </label>
        <input
          name="name"
          required
          placeholder="npr. Avtomobilski saloni — Q1"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Opis
        </label>
        <textarea
          name="description"
          rows={2}
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>

      {FIELDS.map((field) => (
        <div key={field.name}>
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {field.label}
          </label>
          <input
            name={field.name}
            placeholder={field.placeholder}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
          />
        </div>
      ))}

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Prioriteta
        </label>
        <select
          name="priority"
          defaultValue="medium"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Oznake (ločene z vejico)
        </label>
        <input
          name="tags"
          placeholder="npr. hladen kontakt, visoka vrednost"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
        />
      </div>

      <div className="sm:col-span-2">
        <SubmitButton />
        {state.error && <p className="mt-2 text-sm text-red-500">{state.error}</p>}
      </div>
    </form>
  );
}
