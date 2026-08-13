import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for the AVTONET database.
 *
 * avtonet (SBN Auto) is the heavy, high-churn dataset that overwhelmed the
 * shared Supabase free tier, so it lives in its OWN database — a local Postgres
 * reached from production over a Cloudflare tunnel — while auth, Lead
 * Intelligence and Promocije stay on the main Supabase. Set AVTONET_DB_URL +
 * AVTONET_DB_KEY to point here.
 *
 * If those are unset it falls back to the main Supabase credentials, so the app
 * behaves exactly as before until the split is switched on in the environment —
 * a safe deploy with no coordinated cutover.
 */
export function createAvtonetClient() {
  const url = process.env.AVTONET_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.AVTONET_DB_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
