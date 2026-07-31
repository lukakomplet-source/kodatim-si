import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions/require-permission";
import AccessDenied from "@/components/AccessDenied";
import AddUserModal from "./AddUserModal";
import UsersTableClient from "./UsersTableClient";
import {
  filtersFromSearchParams,
  queryUsers,
  getAllRoles,
  USER_STATUSES,
  USER_STATUS_LABELS,
} from "./query";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { allowed } = await requirePagePermission("users.manage");
  if (!allowed) return <AccessDenied />;

  const params = await searchParams;
  const filters = filtersFromSearchParams(params);

  const admin = createAdminClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ users, total, page, totalPages }, roles] = await Promise.all([
    queryUsers(admin, filters),
    getAllRoles(admin),
  ]);

  const val = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : "";
  };

  function statusTabHref(status: string) {
    const sp = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        typeof v === "string" && k !== "status" && k !== "page" ? [[k, v]] : []
      )
    );
    if (status) sp.set("status", status);
    const qs = sp.toString();
    return `/admin/uporabniki${qs ? `?${qs}` : ""}`;
  }

  function pageHref(p: number) {
    const sp = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        typeof v === "string" && k !== "page" ? [[k, v]] : []
      )
    );
    sp.set("page", String(p));
    return `/admin/uporabniki?${sp.toString()}`;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Uporabniki</h1>
          <p className="mt-2 text-base text-zinc-500">
            {total.toLocaleString("sl-SI")} uporabnikov v sistemu
          </p>
        </div>
        <AddUserModal roles={roles} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={statusTabHref("")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            !val("status")
              ? "bg-zinc-900 text-white"
              : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
          }`}
        >
          Vsi
        </Link>
        {USER_STATUSES.map((s) => (
          <Link
            key={s}
            href={statusTabHref(s)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              val("status") === s
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
            }`}
          >
            {USER_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <form
        method="get"
        className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-4"
      >
        <input type="hidden" name="status" value={val("status")} />
        <input
          name="q"
          defaultValue={val("q")}
          placeholder="Iskanje po imenu, emailu, podjetju …"
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none sm:col-span-2"
        />
        <select
          name="role"
          defaultValue={val("role")}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        >
          <option value="">Vse vloge</option>
          {roles.map((r) => (
            <option key={r.id} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={val("sort") || "created_at"}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        >
          <option value="created_at">Najnovejši najprej</option>
          <option value="name">Po imenu</option>
        </select>
        <div className="col-span-full flex items-center gap-3">
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Filtriraj
          </button>
          <Link
            href="/admin/uporabniki"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Počisti filtre
          </Link>
        </div>
      </form>

      <div className="mt-6">
        <UsersTableClient users={users} currentUserId={user?.id ?? ""} />
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Prejšnja
            </Link>
          ) : (
            <span className="px-4 py-2 text-sm text-zinc-300">Prejšnja</span>
          )}
          <span className="text-sm text-zinc-500">
            Stran {page} od {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Naslednja
            </Link>
          ) : (
            <span className="px-4 py-2 text-sm text-zinc-300">Naslednja</span>
          )}
        </div>
      )}
    </div>
  );
}
