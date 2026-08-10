"use server";

import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Starting and stopping a market research from the dashboard.
 *
 * The button does not do the work — it cannot. A research walks about 1,100
 * result pages and then every advert's own page at the ten-second crawl delay
 * the source asks for, which is hours; a Vercel function has minutes and no
 * browser at all. So the click writes one row, and the worker picks it up. That
 * row then carries the progress back, which is why cancelling is also just a
 * status change: the worker notices at its next page boundary and stops.
 *
 * /avtonet is a public demo page, so both actions verify the admin role
 * server-side. The panel is hidden from visitors as a courtesy; this is the
 * actual gate.
 */

export type ActionResult = { error?: string; success?: boolean };

export async function zazeniRaziskavo(): Promise<ActionResult & { id?: string }> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("avtonet_raziskave")
    .insert({ status: "zahtevano", sprozil: user.id })
    .select("id")
    .maybeSingle();

  if (error) {
    // A unique-index conflict is not a failure to explain away: it means a
    // research is already queued or running, which is exactly the state the
    // index exists to guarantee. Two parallel sweeps would double the load on
    // the source and write over each other's progress.
    if (error.code === "23505") {
      return { error: "Raziskava že poteka. Počakajte, da se konča, ali jo prekličite." };
    }
    if (error.code === "PGRST205") {
      return { error: "Baza še ni pripravljena — poženite supabase/migration_avtonet_raziskave.sql." };
    }
    return { error: `Zahteve ni bilo mogoče shraniti: ${error.message}` };
  }

  return { success: true, id: (data as { id: string } | null)?.id };
}

/**
 * Asks the running research to stop.
 *
 * Deliberately not a kill: the worker finds out at its next progress write and
 * finishes the page it is on, so everything already collected stays and the
 * checkpoint remains usable. The status flips immediately, so the dashboard is
 * honest about the intent even though the sweep takes a few seconds to notice.
 */
export async function prekliciRaziskavo(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("avtonet_raziskave")
    .update({ status: "preklicano", konec: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["zahtevano", "tece"]);

  if (error) return { error: `Preklic ni uspel: ${error.message}` };
  return { success: true };
}
