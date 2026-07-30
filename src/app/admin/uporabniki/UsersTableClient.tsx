"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { updateUserRole, deleteUser } from "./actions";

export type UserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "partner";
  referral_code: string | null;
  created_at: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  partner: "Partner",
};

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-accent/10 text-accent",
  partner: "bg-zinc-100 text-zinc-600",
};

export default function UsersTableClient({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(id: string, role: "admin" | "partner") {
    setBusyId(id);
    setErrorId(null);
    const res = await updateUserRole(id, role);
    setBusyId(null);
    if (res.error) {
      setErrorId(id);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Izbrišem uporabnika "${name}"? Tega ni mogoče razveljaviti.`)) {
      return;
    }
    setBusyId(id);
    setErrorId(null);
    const res = await deleteUser(id);
    setBusyId(null);
    if (res.error) {
      setErrorId(id);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-left text-[15px]">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-6 py-4 font-medium">Ime</th>
            <th className="px-6 py-4 font-medium">Email</th>
            <th className="px-6 py-4 font-medium">Vloga</th>
            <th className="px-6 py-4 font-medium">Dodan</th>
            <th className="px-6 py-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {users.length > 0 ? (
            users.map((user) => {
              const isSelf = user.id === currentUserId;
              const busy = busyId === user.id;
              return (
                <tr key={user.id}>
                  <td className="px-6 py-4 text-zinc-900">
                    {user.full_name || "—"}
                    {isSelf && (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
                        Ti
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">{user.email}</td>
                  <td className="px-6 py-4">
                    {isSelf ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_STYLES[user.role]}`}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>
                    ) : (
                      <select
                        value={user.role}
                        disabled={busy}
                        onChange={(e) =>
                          handleRoleChange(
                            user.id,
                            e.target.value as "admin" | "partner"
                          )
                        }
                        className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 focus:border-accent/50 focus:outline-none disabled:opacity-50"
                      >
                        <option value="partner">Partner</option>
                        <option value="admin">Administrator</option>
                      </select>
                    )}
                    {errorId === user.id && error && (
                      <p className="mt-1 text-xs text-red-500">{error}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(user.created_at).toLocaleDateString("sl-SI")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!isSelf && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleDelete(user.id, user.full_name || user.email)
                        }
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                Še ni uporabnikov.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
