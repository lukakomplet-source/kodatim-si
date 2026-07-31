"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2, UserCog } from "lucide-react";
import { deleteUser, updateUserStatus } from "./actions";
import { USER_STATUS_LABELS, type UserRow, type UserStatus } from "./types";

const STATUS_STYLES: Record<UserStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-zinc-100 text-zinc-500",
  suspended: "bg-red-50 text-red-600",
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

  async function handleStatusToggle(user: UserRow) {
    const nextStatus: UserStatus = user.status === "active" ? "inactive" : "active";
    setBusyId(user.id);
    setErrorId(null);
    const res = await updateUserStatus(user.id, nextStatus);
    setBusyId(null);
    if (res.error) {
      setErrorId(user.id);
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
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-left text-[15px]">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-6 py-4 font-medium">Ime</th>
            <th className="px-6 py-4 font-medium">Priimek</th>
            <th className="px-6 py-4 font-medium">Email</th>
            <th className="px-6 py-4 font-medium">Telefon</th>
            <th className="px-6 py-4 font-medium">Podjetje</th>
            <th className="px-6 py-4 font-medium">Vloga</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 font-medium">Registriran</th>
            <th className="px-6 py-4 font-medium">Zadnja prijava</th>
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
                    {user.first_name || "—"}
                    {isSelf && (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
                        Ti
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-900">{user.last_name || "—"}</td>
                  <td className="px-6 py-4 text-zinc-600">{user.email}</td>
                  <td className="px-6 py-4 text-zinc-600">{user.phone || "—"}</td>
                  <td className="px-6 py-4 text-zinc-600">{user.company || "—"}</td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                      {user.roleName || "Brez vloge"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      type="button"
                      disabled={isSelf || busy}
                      onClick={() => handleStatusToggle(user)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${STATUS_STYLES[user.status]}`}
                    >
                      {USER_STATUS_LABELS[user.status]}
                    </button>
                    {errorId === user.id && error && (
                      <p className="mt-1 text-xs text-red-500">{error}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(user.created_at).toLocaleDateString("sl-SI")}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {user.lastSignInAt
                      ? new Date(user.lastSignInAt).toLocaleDateString("sl-SI")
                      : "Še ni prijave"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled
                        title="Kmalu na voljo"
                        className="rounded-md p-1.5 text-zinc-300"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={`/admin/uporabniki/${user.id}`}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      {!isSelf && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleDelete(user.id, `${user.first_name} ${user.last_name}`.trim() || user.email)
                          }
                          className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={10} className="px-6 py-12 text-center text-zinc-400">
                Ni najdenih uporabnikov.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
