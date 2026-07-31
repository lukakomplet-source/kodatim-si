import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/permissions/require-permission";
import AccessDenied from "@/components/AccessDenied";
import ProfileEditForm from "./ProfileEditForm";
import RoleCard from "./RoleCard";
import OverridesEditor from "./OverridesEditor";
import {
  getAllRoles,
  getPermissionIdMap,
  getRolePermissionKeys,
  getUserOverrideMap,
} from "../query";

type ProfileDetailRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  status: string;
  created_at: string;
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { allowed } = await requirePagePermission("users.manage");
  if (!allowed) return <AccessDenied />;

  const { id } = await params;
  const admin = createAdminClient();
  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const [{ data: profile }, roles, { data: roleRow }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, last_name, full_name, email, phone, company, status, created_at")
      .eq("id", id)
      .single<ProfileDetailRow>(),
    getAllRoles(admin),
    admin.from("user_roles").select("role_id").eq("user_id", id).maybeSingle(),
  ]);

  if (!profile) {
    notFound();
  }

  const currentRoleId = roleRow?.role_id ?? null;

  const [roleDefaults, overridesMap, permissionIdMap] = await Promise.all([
    currentRoleId
      ? getRolePermissionKeys(admin, currentRoleId)
      : Promise.resolve(new Set<never>()),
    getUserOverrideMap(admin, id),
    getPermissionIdMap(admin),
  ]);

  return (
    <div>
      <Link
        href="/admin/uporabniki"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na uporabnike
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-zinc-900">
        {profile.full_name || profile.email}
      </h1>
      <p className="mt-2 text-base text-zinc-500">{profile.email}</p>

      <div className="mt-8 space-y-6">
        <ProfileEditForm
          userId={profile.id}
          firstName={profile.first_name ?? ""}
          lastName={profile.last_name ?? ""}
          phone={profile.phone ?? ""}
          company={profile.company ?? ""}
        />

        <RoleCard
          userId={profile.id}
          roles={roles}
          currentRoleId={currentRoleId}
          isSelf={currentUser?.id === profile.id}
        />

        <OverridesEditor
          userId={profile.id}
          roleDefaultKeys={[...roleDefaults]}
          initialOverrides={[...overridesMap.entries()].map(([key, effect]) => ({
            key,
            effect,
          }))}
          permissionIds={[...permissionIdMap.entries()].map(([key, permId]) => ({
            key,
            id: permId,
          }))}
        />
      </div>
    </div>
  );
}
