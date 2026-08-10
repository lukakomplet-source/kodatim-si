"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { preberiDostop } from "@/lib/avtonet/dostop";

/**
 * Deleting a research.
 *
 * What gets deleted is the RUN — its counters and its log. The adverts and the
 * snapshots it collected stay, with their `raziskava_id` set to null by the
 * foreign key. That is the whole point of the `on delete set null` in the
 * migration: the price history and time-on-market record are the most valuable
 * thing this system owns, and a click labelled "delete research" must never take
 * them with it.
 *
 * A running research is stopped rather than deleted. Deleting the row out from
 * under a live worker would leave it writing progress into nothing, and the
 * user's actual intent — make it stop — is served better by cancelling.
 */

export type RaziskavaResult = { error?: string; success?: string };

export async function izbrisiRaziskavo(id: string): Promise<RaziskavaResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { error: "Nimate dovoljenja za to dejanje." };

  const db = createAdminClient();

  const { data: vrstica } = await db
    .from("avtonet_raziskave")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!vrstica) return { error: "Raziskava ne obstaja." };

  const status = (vrstica as { status: string }).status;
  if (status === "tece" || status === "zahtevano") {
    return {
      error: "Raziskava še teče. Najprej jo prekličite, nato jo lahko izbrišete.",
    };
  }

  const { error } = await db.from("avtonet_raziskave").delete().eq("id", id);
  if (error) return { error: `Brisanje ni uspelo: ${error.message}` };

  revalidatePath("/avtonet/pregled");
  return { success: "Raziskava izbrisana. Zbrani oglasi in zgodovina cen ostajajo." };
}
