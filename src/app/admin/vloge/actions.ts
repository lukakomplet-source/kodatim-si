"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions/require-permission";
import { writeAuditLog } from "@/lib/permissions/audit";
import type { PermissionKey } from "@/lib/permissions/registry";

export type RoleActionState = { error?: string; success?: boolean };

export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[],
  permissionKeys: PermissionKey[]
): Promise<RoleActionState> {
  let actor;
  try {
    actor = await requirePermission("roles.manage");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();

  const { error: deleteError } = await admin
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);
  if (deleteError) {
    return { error: "Dovoljenj vloge ni bilo mogoče posodobiti." };
  }

  if (permissionIds.length > 0) {
    const { error: insertError } = await admin.from("role_permissions").insert(
      permissionIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId }))
    );
    if (insertError) {
      return { error: "Dovoljenj vloge ni bilo mogoče posodobiti." };
    }
  }

  await writeAuditLog({
    actorId: actor.userId,
    action: "role_permissions_changed",
    targetType: "role",
    targetId: roleId,
    metadata: { permissions: permissionKeys },
  });

  revalidatePath("/admin/vloge");
  revalidatePath(`/admin/vloge/${roleId}`);
  return { success: true };
}
