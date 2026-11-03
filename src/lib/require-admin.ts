import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserPermissions } from "@/lib/permissions/require-permission";
import type { PermissionKey } from "@/lib/permissions/registry";

type Preverjanje =
  | { ok: true; user: User }
  | { ok: false; razlog: "prijava" | "neaktiven" | "dovoljenje" };

/**
 * Admin level = legacy admin (profiles.role = 'admin') or an RBAC role with
 * bypass_all (Super Admin); getCurrentUserPermissions() sets bypassAll for
 * both. With `kljuci`, a user holding ANY of those permissions passes too.
 * An account whose status is not 'active' never passes.
 */
async function preveri(kljuci: PermissionKey[]): Promise<Preverjanje> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, razlog: "prijava" };

  const perms = await getCurrentUserPermissions();
  if (!perms) return { ok: false, razlog: "prijava" };
  if (perms.neaktiven) return { ok: false, razlog: "neaktiven" };
  if (perms.bypassAll || kljuci.some((k) => perms.granted.has(k))) return { ok: true, user };
  return { ok: false, razlog: "dovoljenje" };
}

function napaka(razlog: "prijava" | "neaktiven" | "dovoljenje"): Error {
  if (razlog === "prijava") return new Error("Niste prijavljeni.");
  if (razlog === "neaktiven") return new Error("Vaš račun je neaktiven.");
  return new Error("Nimate dovoljenja za to dejanje.");
}

/**
 * Throws if the current session isn't an admin-level user (legacy admin or
 * Super Admin). Use at the top of every server action and route handler that
 * touches admin-only data — proxy.ts only checks that a session exists, not
 * the role, and it doesn't cover /api/* routes at all.
 */
export async function requireAdmin(): Promise<User> {
  const r = await preveri([]);
  if (!r.ok) throw napaka(r.razlog);
  return r.user;
}

/** Like requireAdmin(), but a user holding any of `kljuci` passes as well. */
export async function requireAdminAli(...kljuci: PermissionKey[]): Promise<User> {
  const r = await preveri(kljuci);
  if (!r.ok) throw napaka(r.razlog);
  return r.user;
}

/**
 * For page.tsx server components: same check as requireAdminAli(), but
 * instead of throwing (which would only show the generic error screen) it
 * sends the user to the friendly »Nimate dovoljenja« page, to login, or to
 * the inactive-account page.
 */
export async function zahtevajStran(...kljuci: PermissionKey[]): Promise<User> {
  const r = await preveri(kljuci);
  if (r.ok) return r.user;
  if (r.razlog === "prijava") redirect("/prijava?redirect=/admin");
  if (r.razlog === "neaktiven") redirect("/racun-neaktiven");
  redirect("/admin/ni-dovoljenja");
}
