import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PermissionKey, RoleKey } from "./registry";
import type { EffectivePermissions } from "./types";

type RoleRow = { key: RoleKey; name: string; bypass_all: boolean };
type UserRoleRow = { role_id: string; roles: RoleRow };
type RolePermissionRow = { permissions: { key: PermissionKey } };
type UserPermissionRow = { effect: "grant" | "revoke"; permissions: { key: PermissionKey } };

/**
 * Computes the current session's effective permission set once per request
 * (React cache() dedupes repeated calls across layout + page). Returns null
 * when nobody is logged in.
 */
export const getCurrentUserPermissions = cache(
  async (): Promise<EffectivePermissions | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role_id, roles(key, name, bypass_all)")
      .eq("user_id", user.id)
      .maybeSingle<UserRoleRow>();

    if (!roleRow) {
      return {
        userId: user.id,
        roleId: null,
        roleKey: null,
        roleName: null,
        bypassAll: false,
        granted: new Set(),
      };
    }

    if (roleRow.roles.bypass_all) {
      return {
        userId: user.id,
        roleId: roleRow.role_id,
        roleKey: roleRow.roles.key,
        roleName: roleRow.roles.name,
        bypassAll: true,
        granted: new Set(),
      };
    }

    const [{ data: rolePerms }, { data: overrides }] = await Promise.all([
      supabase
        .from("role_permissions")
        .select("permissions(key)")
        .eq("role_id", roleRow.role_id)
        .returns<RolePermissionRow[]>(),
      supabase
        .from("user_permissions")
        .select("effect, permissions(key)")
        .eq("user_id", user.id)
        .returns<UserPermissionRow[]>(),
    ]);

    const granted = new Set<PermissionKey>((rolePerms ?? []).map((r) => r.permissions.key));
    for (const o of overrides ?? []) {
      if (o.effect === "grant") granted.add(o.permissions.key);
      if (o.effect === "revoke") granted.delete(o.permissions.key);
    }

    return {
      userId: user.id,
      roleId: roleRow.role_id,
      roleKey: roleRow.roles.key,
      roleName: roleRow.roles.name,
      bypassAll: false,
      granted,
    };
  }
);

export function hasPermission(
  perms: EffectivePermissions | null,
  key: PermissionKey
): boolean {
  if (!perms) return false;
  return perms.bypassAll || perms.granted.has(key);
}

/** Throws — use at the top of server actions / API route handlers, mirrors requireAdmin(). */
export async function requirePermission(key: PermissionKey) {
  const perms = await getCurrentUserPermissions();
  if (!perms) throw new Error("Niste prijavljeni.");
  if (!hasPermission(perms, key)) throw new Error("Nimate dovoljenja za to dejanje.");
  return perms;
}

/** Non-throwing — use at the top of page.tsx server components. */
export async function requirePagePermission(key: PermissionKey) {
  const perms = await getCurrentUserPermissions();
  return { allowed: hasPermission(perms, key), permissions: perms };
}
