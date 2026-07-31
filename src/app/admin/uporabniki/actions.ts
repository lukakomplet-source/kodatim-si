"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions/require-permission";
import { writeAuditLog } from "@/lib/permissions/audit";
import type { PermissionKey } from "@/lib/permissions/registry";
import type { UserStatus } from "./types";

export type CreateUserState = { error?: string; success?: boolean };

export async function createUser(
  _prevState: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  let actor;
  try {
    actor = await requirePermission("users.manage");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();
  const status = String(formData.get("status") ?? "active").trim() as UserStatus;
  const mode = String(formData.get("mode") ?? "invite").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!firstName || !lastName || !email || !roleId) {
    return { error: "Izpolnite ime, priimek, email in vlogo." };
  }
  if (mode === "password") {
    if (!password || password.length < 8) {
      return { error: "Geslo mora imeti vsaj 8 znakov." };
    }
    if (password !== confirmPassword) {
      return { error: "Gesli se ne ujemata." };
    }
  }

  const admin = createAdminClient();
  const fullName = `${firstName} ${lastName}`.trim();

  let userId: string;
  if (mode === "password") {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return { error: createError?.message ?? "Uporabnika ni bilo mogoče ustvariti." };
    }
    userId = created.user.id;
  } else {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/nastavi-geslo` }
    );
    if (inviteError || !invited.user) {
      return { error: inviteError?.message ?? "Povabila ni bilo mogoče poslati." };
    }
    userId = invited.user.id;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      phone: phone || null,
      company: company || null,
      status,
    })
    .eq("id", userId);

  if (profileError) {
    return { error: "Uporabnik je ustvarjen, a profila ni bilo mogoče urediti." };
  }

  const { error: roleError } = await admin
    .from("user_roles")
    .upsert(
      { user_id: userId, role_id: roleId, assigned_by: actor.userId },
      { onConflict: "user_id" }
    );

  if (roleError) {
    return { error: "Uporabnik je ustvarjen, a vloge ni bilo mogoče dodeliti." };
  }

  await writeAuditLog({
    actorId: actor.userId,
    action: "user_created",
    targetType: "user",
    targetId: userId,
    metadata: { email, mode },
  });

  revalidatePath("/admin/uporabniki");
  return { success: true };
}

export type UserActionState = { error?: string; success?: boolean };

export async function updateUserRole(
  userId: string,
  roleId: string
): Promise<UserActionState> {
  let actor;
  try {
    actor = await requirePermission("users.manage");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }
  if (actor.userId === userId) {
    return { error: "Ne moreš spremeniti vloge lastnega računa." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_roles")
    .upsert(
      { user_id: userId, role_id: roleId, assigned_by: actor.userId },
      { onConflict: "user_id" }
    );
  if (error) return { error: "Vloge ni bilo mogoče spremeniti." };

  await writeAuditLog({
    actorId: actor.userId,
    action: "role_assigned",
    targetType: "user",
    targetId: userId,
    metadata: { roleId },
  });

  revalidatePath("/admin/uporabniki");
  revalidatePath(`/admin/uporabniki/${userId}`);
  return { success: true };
}

export async function updateUserStatus(
  userId: string,
  status: UserStatus
): Promise<UserActionState> {
  let actor;
  try {
    actor = await requirePermission("users.manage");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }
  if (actor.userId === userId) {
    return { error: "Ne moreš spremeniti statusa lastnega računa." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ status }).eq("id", userId);
  if (error) return { error: "Statusa ni bilo mogoče spremeniti." };

  await writeAuditLog({
    actorId: actor.userId,
    action: "status_changed",
    targetType: "user",
    targetId: userId,
    metadata: { status },
  });

  revalidatePath("/admin/uporabniki");
  return { success: true };
}

export async function updateUserProfile(
  userId: string,
  fields: { firstName: string; lastName: string; phone: string; company: string }
): Promise<UserActionState> {
  try {
    await requirePermission("users.manage");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const fullName = `${fields.firstName} ${fields.lastName}`.trim();
  const { error } = await admin
    .from("profiles")
    .update({
      first_name: fields.firstName,
      last_name: fields.lastName,
      full_name: fullName,
      phone: fields.phone || null,
      company: fields.company || null,
    })
    .eq("id", userId);
  if (error) return { error: "Profila ni bilo mogoče posodobiti." };

  revalidatePath(`/admin/uporabniki/${userId}`);
  revalidatePath("/admin/uporabniki");
  return { success: true };
}

export async function updateUserOverrides(
  userId: string,
  changes: { permissionId: string; permissionKey: PermissionKey; effect: "grant" | "revoke" | "reset" }[]
): Promise<UserActionState> {
  let actor;
  try {
    actor = await requirePermission("users.manage");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();

  const toReset = changes.filter((c) => c.effect === "reset");
  const toUpsert = changes.filter((c) => c.effect !== "reset");

  if (toReset.length > 0) {
    const { error } = await admin
      .from("user_permissions")
      .delete()
      .eq("user_id", userId)
      .in(
        "permission_id",
        toReset.map((c) => c.permissionId)
      );
    if (error) return { error: "Dovoljenj ni bilo mogoče posodobiti." };
  }

  if (toUpsert.length > 0) {
    const { error } = await admin.from("user_permissions").upsert(
      toUpsert.map((c) => ({
        user_id: userId,
        permission_id: c.permissionId,
        effect: c.effect,
        created_by: actor.userId,
      })),
      { onConflict: "user_id,permission_id" }
    );
    if (error) return { error: "Dovoljenj ni bilo mogoče posodobiti." };
  }

  await writeAuditLog({
    actorId: actor.userId,
    action: "permission_override_changed",
    targetType: "user",
    targetId: userId,
    metadata: { changes: changes.map((c) => ({ key: c.permissionKey, effect: c.effect })) },
  });

  revalidatePath(`/admin/uporabniki/${userId}`);
  return { success: true };
}

export async function deleteUser(id: string): Promise<UserActionState> {
  let actor;
  try {
    actor = await requirePermission("users.manage");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }
  if (actor.userId === id) {
    return { error: "Ne moreš izbrisati lastnega računa." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", id)
    .single();

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: "Uporabnika ni bilo mogoče izbrisati." };

  await writeAuditLog({
    actorId: actor.userId,
    action: "user_deleted",
    targetType: "user",
    targetId: id,
    metadata: { email: profile?.email, fullName: profile?.full_name },
  });

  revalidatePath("/admin/uporabniki");
  return { success: true };
}
