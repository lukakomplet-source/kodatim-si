"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PermissionsEditor from "@/components/permissions/PermissionsEditor";
import { updateUserOverrides } from "../actions";
import type { PermissionKey } from "@/lib/permissions/registry";

export default function OverridesEditor({
  userId,
  roleDefaultKeys,
  initialOverrides,
  permissionIds,
}: {
  userId: string;
  roleDefaultKeys: PermissionKey[];
  initialOverrides: { key: PermissionKey; effect: "grant" | "revoke" }[];
  permissionIds: { key: PermissionKey; id: string }[];
}) {
  const router = useRouter();
  const roleDefaults = useMemo(() => new Set(roleDefaultKeys), [roleDefaultKeys]);
  const idByKey = useMemo(
    () => new Map(permissionIds.map((p) => [p.key, p.id])),
    [permissionIds]
  );
  const initialMap = useMemo(
    () => new Map(initialOverrides.map((o) => [o.key, o.effect])),
    [initialOverrides]
  );

  const [overrides, setOverrides] = useState<Map<PermissionKey, "grant" | "revoke">>(
    () => new Map(initialMap)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    overrides.size !== initialMap.size ||
    [...overrides.entries()].some(([k, v]) => initialMap.get(k) !== v);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const allKeys = new Set([...initialMap.keys(), ...overrides.keys()]);
    const changes: { permissionId: string; permissionKey: PermissionKey; effect: "grant" | "revoke" | "reset" }[] = [];
    for (const key of allKeys) {
      const before = initialMap.get(key);
      const after = overrides.get(key);
      if (before === after) continue;
      const permissionId = idByKey.get(key);
      if (!permissionId) continue;
      changes.push({
        permissionId,
        permissionKey: key,
        effect: after ?? "reset",
      });
    }

    if (changes.length === 0) {
      setSaving(false);
      return;
    }

    const res = await updateUserOverrides(userId, changes);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Dovoljenja</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Privzeto podedovano od vloge. Klik na potrditveno polje ustvari
            izjemo za tega uporabnika.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {saving ? "Shranjujem …" : "Shrani dovoljenja"}
          </button>
          {saved && !dirty && (
            <span className="text-sm text-emerald-600">Shranjeno.</span>
          )}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>
      <div className="mt-5">
        <PermissionsEditor
          mode="user-override"
          roleDefaults={roleDefaults}
          overrides={overrides}
          onChange={setOverrides}
        />
      </div>
    </div>
  );
}
