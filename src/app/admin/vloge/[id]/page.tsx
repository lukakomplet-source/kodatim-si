import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePagePermission } from "@/lib/permissions/require-permission";
import AccessDenied from "@/components/AccessDenied";
import RolePermissionsForm from "./RolePermissionsForm";
import { getPermissionIdMap, getRolePermissionKeys } from "../../uporabniki/query";

export default async function AdminRoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { allowed } = await requirePagePermission("roles.manage");
  if (!allowed) return <AccessDenied />;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: role } = await admin
    .from("roles")
    .select("id, name, description, bypass_all, is_system")
    .eq("id", id)
    .single();

  if (!role) {
    notFound();
  }

  const [roleDefaults, permissionIdMap] = await Promise.all([
    getRolePermissionKeys(admin, id),
    getPermissionIdMap(admin),
  ]);

  return (
    <div>
      <Link
        href="/admin/vloge"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na vloge
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-zinc-900">{role.name}</h1>
      <p className="mt-2 text-base text-zinc-500">{role.description || "—"}</p>

      {role.bypass_all && (
        <p className="mt-4 rounded-xl bg-accent/5 px-4 py-3 text-sm text-accent">
          Super Admin ima dostop do vsega ne glede na spodnji seznam — seznam
          je zgolj informativen.
        </p>
      )}

      <div className="mt-8">
        <RolePermissionsForm
          roleId={role.id}
          initialSelectedKeys={[...roleDefaults]}
          permissionIds={[...permissionIdMap.entries()].map(([key, permId]) => ({
            key,
            id: permId,
          }))}
          disabled={role.bypass_all}
        />
      </div>
    </div>
  );
}
