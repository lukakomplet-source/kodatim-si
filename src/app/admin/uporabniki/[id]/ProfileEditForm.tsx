"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUserProfile } from "../actions";

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none";

export default function ProfileEditForm({
  userId,
  firstName,
  lastName,
  phone,
  company,
}: {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState({ firstName, lastName, phone, company });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateUserProfile(userId, values);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Profil</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-zinc-700">Ime</label>
          <input
            value={values.firstName}
            onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">Priimek</label>
          <input
            value={values.lastName}
            onChange={(e) => setValues((v) => ({ ...v, lastName: e.target.value }))}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">Telefon</label>
          <input
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">Podjetje</label>
          <input
            value={values.company}
            onChange={(e) => setValues((v) => ({ ...v, company: e.target.value }))}
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {saving ? "Shranjujem …" : "Shrani profil"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Shranjeno.</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
