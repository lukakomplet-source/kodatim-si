import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Who is looking at SBN Auto, and what they may see.
 *
 * One place, because the answer decides three different things — which nav tabs
 * render, which pages redirect, and whose spremljanja a query returns — and
 * three copies of that rule would eventually disagree.
 *
 * Two ways in:
 *  - a KodaTim admin (profiles.role = 'admin') is always an SBN Auto admin, so
 *    the agency never locks itself out of its own demo
 *  - anyone listed in avtonet_uporabniki with aktiven = true
 *
 * Passwords are not this file's business. Supabase Auth holds them; here we only
 * read who the session belongs to.
 */

export type Dostop = {
  userId: string | null;
  email: string | null;
  /** Signed in AND allowed into SBN Auto. */
  jeUporabnik: boolean;
  jeAdmin: boolean;
  /** Where notifications for this person go; falls back to the login address. */
  obvestilaEmail: string | null;
};

export const BREZ_DOSTOPA: Dostop = {
  userId: null,
  email: null,
  jeUporabnik: false,
  jeAdmin: false,
  obvestilaEmail: null,
};

export async function preberiDostop(): Promise<Dostop> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return BREZ_DOSTOPA;

  // profiles/roles live on the MAIN Supabase (auth); avtonet_uporabniki lives
  // in the separate avtonet DB. Two clients, one for each.
  const admin = createAdminClient();
  const avtonet = createAvtonetClient();

  const [{ data: profil }, { data: vpis }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    avtonet
      .from("avtonet_uporabniki")
      .select("vloga, aktiven, obvestila_email")
      .eq("uporabnik", user.id)
      .maybeSingle(),
  ]);

  const kodatimAdmin = (profil as { role?: string } | null)?.role === "admin";
  const zapis = vpis as { vloga: string; aktiven: boolean; obvestila_email: string | null } | null;
  const aktivenVpis = zapis?.aktiven === true;

  return {
    userId: user.id,
    email: user.email ?? null,
    jeUporabnik: kodatimAdmin || aktivenVpis,
    jeAdmin: kodatimAdmin || (aktivenVpis && zapis?.vloga === "admin"),
    obvestilaEmail: zapis?.obvestila_email ?? user.email ?? null,
  };
}

/** The path to send someone to when they need to sign in first. */
export function prijavaZa(pot: string): string {
  return `/prijava?redirect=${encodeURIComponent(pot)}`;
}
