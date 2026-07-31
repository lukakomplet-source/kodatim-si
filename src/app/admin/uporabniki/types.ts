// Pure types/constants shared between server code (query.ts, actions.ts,
// page.tsx) and client components (UsersTableClient.tsx, AddUserModal.tsx,
// [id]/RoleCard.tsx). Deliberately has NO "server-only" import and NO
// Supabase imports — client components must import from here, never from
// query.ts, or the "server-only" guard breaks the production build.
import type { RoleKey } from "@/lib/permissions/registry";

export type UserStatus = "active" | "inactive" | "suspended";
export const USER_STATUSES: UserStatus[] = ["active", "inactive", "suspended"];
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Aktiven",
  inactive: "Neaktiven",
  suspended: "Suspendiran",
};

export type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  status: UserStatus;
  created_at: string;
  roleKey: RoleKey | null;
  roleName: string | null;
  lastSignInAt: string | null;
};

export type RoleOption = { id: string; key: RoleKey; name: string; description: string | null };
