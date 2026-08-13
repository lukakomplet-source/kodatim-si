"use server";

import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";

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

  const db = createAvtonetClient();
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

  const db = createAvtonetClient();
  const { error } = await db
    .from("avtonet_raziskave")
    .update({ status: "preklicano", konec: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["zahtevano", "tece"]);

  if (error) return { error: `Preklic ni uspel: ${error.message}` };
  return { success: true };
}

export type Urnik = { omogocen: boolean; ure: string };

/** Cleans "5, 10, 22" style input into a sorted, de-duplicated list of valid hours. */
function ocistiUre(raw: string): string {
  const ure = raw
    .split(/[,\s]+/)
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return [...new Set(ure)].sort((a, b) => a - b).join(",");
}

/**
 * The automatic-sweep schedule, shared with the worker.
 *
 * The row is the single source of truth: the dashboard writes it here and the
 * worker reads it every poll, so changing the hours takes effect without
 * touching env vars or redeploying anything. A missing table just means the
 * migration has not been run — reported, not thrown.
 */
export async function shraniUrnik(omogocen: boolean, ure: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const ociscene = ocistiUre(ure);
  if (omogocen && !ociscene) {
    return { error: "Vnesite vsaj eno veljavno uro (0–23), npr. 5, 10, 22." };
  }

  const db = createAvtonetClient();
  const { error } = await db
    .from("avtonet_urnik")
    .upsert({ id: 1, omogocen, ure: ociscene || "5,10,22", posodobljeno: new Date().toISOString() });

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return { error: "Tabela urnika še ne obstaja — poženite supabase/migration_avtonet_urnik.sql." };
    }
    return { error: `Urnika ni bilo mogoče shraniti: ${error.message}` };
  }
  return { success: true };
}
