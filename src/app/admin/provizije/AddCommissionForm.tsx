"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addCommission, type AddCommissionState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Shranjujem …" : "Dodaj provizijo"}
    </button>
  );
}

const initialState: AddCommissionState = {};
const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none";

export default function AddCommissionForm({
  partners,
}: {
  partners: { id: string; full_name: string | null; email: string }[];
}) {
  const [state, formAction] = useActionState(addCommission, initialState);

  return (
    <form
      action={formAction}
      className="grid gap-4 sm:grid-cols-5 sm:items-end"
    >
      <div className="sm:col-span-2">
        <label className="text-sm font-medium text-zinc-700">Partner</label>
        <select name="partnerId" required className={FIELD_CLASS}>
          <option value="">Izberite …</option>
          {partners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.full_name || partner.email}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-700">
          Znesek (€)
        </label>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          required
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-700">Tip</label>
        <select name="type" required className={FIELD_CLASS}>
          <option value="first_invoice">Prva faktura (20 %)</option>
          <option value="monthly">Mesečna provizija</option>
        </select>
      </div>
      <SubmitButton />
      <div className="sm:col-span-5">
        <label className="text-sm font-medium text-zinc-700">
          Opomba (neobvezno)
        </label>
        <input
          name="note"
          placeholder="npr. ime stranke ali številka fakture"
          className={FIELD_CLASS}
        />
      </div>
      {state.error && (
        <p className="text-sm text-red-500 sm:col-span-5">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-600 sm:col-span-5">
          Provizija je shranjena.
        </p>
      )}
    </form>
  );
}
