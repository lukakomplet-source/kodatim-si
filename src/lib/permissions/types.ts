import type { PermissionKey, RoleKey } from "./registry";

export type EffectivePermissions = {
  userId: string;
  roleId: string | null;
  roleKey: RoleKey | null;
  roleName: string | null;
  bypassAll: boolean;
  granted: Set<PermissionKey>;
};
