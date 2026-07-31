import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_KEYS, type RoleKey, type PermissionKey } from "@/lib/permissions/registry";
import { USER_STATUSES, type UserStatus, type UserRow, type RoleOption } from "./types";

export * from "./types";

const USERS_PER_PAGE = 20;

export type UserFilters = {
  q?: string;
  role?: RoleKey;
  status?: UserStatus;
  sort?: "name" | "created_at";
  page: number;
};

export function filtersFromSearchParams(
  params: Record<string, string | string[] | undefined>
): UserFilters {
  const str = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string).trim() : undefined;
  const q = str("q");
  const role = str("role");
  const status = str("status");
  const sort = str("sort");
  const pageRaw = str("page");

  return {
    q: q || undefined,
    role:
      role && (ROLE_KEYS as readonly string[]).includes(role)
        ? (role as RoleKey)
        : undefined,
    status:
      status && (USER_STATUSES as readonly string[]).includes(status)
        ? (status as UserStatus)
        : undefined,
    sort: sort === "name" ? "name" : "created_at",
    page: pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1,
  };
}

type AdminClient = ReturnType<typeof createAdminClient>;

type RoleEmbed = { key: RoleKey; name: string } | { key: RoleKey; name: string }[] | null;
type UserRolesEmbed =
  | { role_id: string; roles: RoleEmbed }
  | { role_id: string; roles: RoleEmbed }[]
  | null;

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  status: UserStatus;
  created_at: string;
  user_roles: UserRolesEmbed;
};

function unwrap<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function queryUsers(admin: AdminClient, filters: UserFilters) {
  const embed = filters.role
    ? "user_roles!inner(role_id, roles!inner(key,name))"
    : "user_roles(role_id, roles(key,name))";

  let query = admin
    .from("profiles")
    .select(
      `id, first_name, last_name, full_name, email, phone, company, status, created_at, ${embed}`,
      { count: "exact" }
    );

  if (filters.q) {
    const q = filters.q.replace(/[%,]/g, "");
    query = query.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`
    );
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.role) query = query.eq("user_roles.roles.key", filters.role);

  query = query.order(filters.sort === "name" ? "first_name" : "created_at", {
    ascending: filters.sort === "name",
  });

  const from = (filters.page - 1) * USERS_PER_PAGE;
  const to = from + USERS_PER_PAGE - 1;
  const { data, count, error } = await query.range(from, to).returns<ProfileRow[]>();

  if (error) {
    throw new Error(`Poizvedba ni uspela: ${error.message}`);
  }

  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const lastSignInById = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null])
  );

  const users: UserRow[] = (data ?? []).map((row) => {
    const ur = unwrap(row.user_roles);
    const role = ur ? unwrap(ur.roles) : null;
    return {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      status: row.status,
      created_at: row.created_at,
      roleKey: role?.key ?? null,
      roleName: role?.name ?? null,
      lastSignInAt: lastSignInById.get(row.id) ?? null,
    };
  });

  return {
    users,
    total: count ?? 0,
    page: filters.page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / USERS_PER_PAGE)),
  };
}

export async function getAllRoles(admin: AdminClient): Promise<RoleOption[]> {
  const { data } = await admin
    .from("roles")
    .select("id, key, name, description")
    .order("name");
  return (data ?? []) as RoleOption[];
}

export async function getRolePermissionKeys(
  admin: AdminClient,
  roleId: string
): Promise<Set<PermissionKey>> {
  const { data } = await admin
    .from("role_permissions")
    .select("permissions(key)")
    .eq("role_id", roleId)
    .returns<{ permissions: { key: PermissionKey } }[]>();
  return new Set((data ?? []).map((r) => r.permissions.key));
}

export async function getPermissionIdMap(
  admin: AdminClient
): Promise<Map<PermissionKey, string>> {
  const { data } = await admin
    .from("permissions")
    .select("id, key")
    .returns<{ id: string; key: PermissionKey }[]>();
  return new Map((data ?? []).map((p) => [p.key, p.id]));
}

export async function getUserOverrideMap(
  admin: AdminClient,
  userId: string
): Promise<Map<PermissionKey, "grant" | "revoke">> {
  const { data } = await admin
    .from("user_permissions")
    .select("effect, permissions(key)")
    .eq("user_id", userId)
    .returns<{ effect: "grant" | "revoke"; permissions: { key: PermissionKey } }[]>();
  const map = new Map<PermissionKey, "grant" | "revoke">();
  for (const row of data ?? []) map.set(row.permissions.key, row.effect);
  return map;
}
