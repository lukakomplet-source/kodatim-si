"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { updatePayoutDetails, type PayoutDetailsState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
    >
      {pending ? "Shranjujem …" : "Shrani podatke"}
    </button>
  );
}

const initialState: PayoutDetailsState = {};
const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-[15px] text-zinc-900 focus:border-accent/50 focus:outline-none";

export default function PayoutDetailsForm({
  entityType: initialEntityType,
  companyName,
  taxId,
  accountHolderName,
  iban,
  bankName,
}: {
  entityType: string | null;
  companyName: string | null;
  taxId: string | null;
  accountHolderName: string | null;
  iban: string | null;
  bankName: string | null;
}) {
  const [state, formAction] = useActionState(
    updatePayoutDetails,
    initialState
  );
  const [entityType, setEntityType] = useState(
    initialEntityType ?? "individual"
  );

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-sm font-medium text-zinc-700">Vrsta</label>
        <div className="mt-2 flex gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
            <input
              type="radio"
              name="entityType"
              value="individual"
              checked={entityType === "individual"}
              onChange={() => setEntityType("individual")}
            />
            Fizična oseba
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
            <input
              type="radio"
              name="entityType"
              value="company"
              checked={entityType === "company"}
              onChange={() => setEntityType("company")}
            />
            Podjetje
          </label>
        </div>
      </div>

      {entityType === "company" && (
        <div className="sm:col-span-2">
          <label className="text-sm font-medium text-zinc-700">
            Naziv podjetja
          </label>
          <input
            name="companyName"
            defaultValue={companyName ?? ""}
            className={FIELD_CLASS}
          />
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-zinc-700">
          {entityType === "company" ? "Ime odgovorne osebe" : "Ime in priimek"}
        </label>
        <input
          name="accountHolderName"
          defaultValue={accountHolderName ?? ""}
          required
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-700">
          Davčna številka (neobvezno)
        </label>
        <input name="taxId" defaultValue={taxId ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-700">IBAN</label>
        <input
          name="iban"
          defaultValue={iban ?? ""}
          required
          placeholder="SI56 1234 5678 9012 345"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-700">
          Banka (neobvezno)
        </label>
        <input
          name="bankName"
          defaultValue={bankName ?? ""}
          className={FIELD_CLASS}
        />
      </div>

      <div className="sm:col-span-2">
        <SubmitButton />
        {state.error && (
          <p className="mt-3 text-sm text-red-500">{state.error}</p>
        )}
        {state.success && (
          <p className="mt-3 text-sm text-emerald-600">
            Podatki so shranjeni.
          </p>
        )}
      </div>
    </form>
  );
}
