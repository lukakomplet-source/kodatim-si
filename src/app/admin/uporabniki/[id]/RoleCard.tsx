"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUserRole } from "../actions";
import type { RoleOption } from "../types";

export default function RoleCard({
  userId,
  roles,
  currentRoleId,
  isSelf,
}: {
  userId: string;
  roles: RoleOption[];
  currentRoleId: string | null;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(currentRoleId ?? roles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateUserRole(userId, roleId);
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
      <h2 className="text-lg font-semibold text-zinc-900">Vloga</h2>
      {isSelf ? (
        <p className="mt-3 text-sm text-zinc-500">
          Ne moreš spremeniti vloge lastnega računa.
        </p>
      ) : (
        <>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="mt-3 w-full max-w-sm rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || roleId === currentRoleId}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving ? "Shranjujem …" : "Shrani vlogo"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Shranjeno.</span>}
            {error && <span className="text-sm text-red-500">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
