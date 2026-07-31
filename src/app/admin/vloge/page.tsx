import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions/require-permission";
import AccessDenied from "@/components/AccessDenied";

export default async function AdminRolesPage() {
  const { allowed } = await requirePagePermission("roles.manage");
  if (!allowed) return <AccessDenied />;

  const admin = createAdminClient();
  const [{ data: roles }, { data: rolePermissions }] = await Promise.all([
    admin.from("roles").select("id, key, name, description, bypass_all, is_system").order("name"),
    admin.from("role_permissions").select("role_id"),
  ]);

  const countByRole = new Map<string, number>();
  for (const row of rolePermissions ?? []) {
    countByRole.set(row.role_id, (countByRole.get(row.role_id) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Vloge</h1>
      <p className="mt-2 text-base text-zinc-500">
        Privzeta dovoljenja po vlogi. Posamezniku lahko dovoljenja dodatno
        prilagodiš na njegovi strani v Uporabnikih.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(roles ?? []).map((role) => (
          <Link
            key={role.id}
            href={`/admin/vloge/${role.id}`}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-accent/40"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </span>
              {role.is_system && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                  Sistemska vloga
                </span>
              )}
            </div>
            <h2 className="mt-4 text-base font-semibold text-zinc-900">
              {role.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {role.description || "—"}
            </p>
            <p className="mt-3 text-xs font-medium text-zinc-400">
              {role.bypass_all
                ? "Vsa dovoljenja"
                : `${countByRole.get(role.id) ?? 0} dovoljenj`}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
