"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PermissionsEditor from "@/components/permissions/PermissionsEditor";
import { updateRolePermissions } from "../actions";
import type { PermissionKey } from "@/lib/permissions/registry";

export default function RolePermissionsForm({
  roleId,
  initialSelectedKeys,
  permissionIds,
  disabled,
}: {
  roleId: string;
  initialSelectedKeys: PermissionKey[];
  permissionIds: { key: PermissionKey; id: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const idByKey = useMemo(
    () => new Map(permissionIds.map((p) => [p.key, p.id])),
    [permissionIds]
  );
  const [selected, setSelected] = useState<Set<PermissionKey>>(
    () => new Set(initialSelectedKeys)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    selected.size !== initialSelectedKeys.length ||
    initialSelectedKeys.some((k) => !selected.has(k));

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const keys = [...selected];
    const ids = keys.map((k) => idByKey.get(k)).filter((v): v is string => Boolean(v));
    const res = await updateRolePermissions(roleId, ids, keys);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-end gap-3">
        {!disabled && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {saving ? "Shranjujem …" : "Shrani dovoljenja"}
          </button>
        )}
        {saved && !dirty && (
          <span className="text-sm text-emerald-600">Shranjeno.</span>
        )}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
      <PermissionsEditor
        mode="role-default"
        selected={selected}
        onChange={setSelected}
        disabled={disabled}
      />
    </div>
  );
}
