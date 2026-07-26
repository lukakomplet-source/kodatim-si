import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Throws if the current session isn't a logged-in admin. Use at the top of
 * every server action and route handler that touches admin-only data —
 * proxy.ts only checks that a session exists, not the role, and it doesn't
 * cover /api/* routes at all.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Niste prijavljeni.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("Nimate dovoljenja za to dejanje.");
  }

  return user;
}
