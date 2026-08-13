"use server";

import { revalidatePath } from "next/cache";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";

/**
 * Suggestions: "this should be added", "this is broken".
 *
 * Deliberately inert. Writing a suggestion changes nothing but a row in a table
 * — it does not reach the AI editor, does not touch a file, does not run a
 * build. Anything else would mean every person with an account could cause code
 * to change on the strength of a sentence, with no one reading it first.
 *
 * The admin decides what to do with each one, and hands it to the editor by
 * choice.
 */

export type PredlogResult = { error?: string; success?: string };

export async function oddajPredlog(
  _prev: PredlogResult,
  formData: FormData
): Promise<PredlogResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) return { error: "Niste prijavljeni." };

  const besedilo = String(formData.get("besedilo") ?? "").trim();
  if (besedilo.length < 5) return { error: "Napišite malo več — kaj naj dodamo ali popravimo?" };
  if (besedilo.length > 4000) return { error: "Predlog je predolg (največ 4000 znakov)." };

  const db = createAvtonetClient();
  const { error } = await db
    .from("avtonet_predlogi")
    .insert({ besedilo, avtor: dostop.userId, status: "novo" });

  if (error) {
    if (error.code === "PGRST205") {
      return { error: "Poženite supabase/migration_avtonet_uporabniki.sql." };
    }
    return { error: `Predloga ni bilo mogoče shraniti: ${error.message}` };
  }

  revalidatePath("/avtonet/urejanje");
  return { success: "Hvala — predlog je zabeležen." };
}

export async function spremeniStatusPredloga(
  id: string,
  status: string,
  odgovor?: string
): Promise<PredlogResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { error: "Nimate dovoljenja za to dejanje." };
  if (!["novo", "v_delu", "reseno", "zavrnjeno"].includes(status)) {
    return { error: "Neveljaven status." };
  }

  const db = createAvtonetClient();
  const patch: Record<string, unknown> = { status };
  if (odgovor !== undefined) patch.odgovor = odgovor.trim() || null;

  const { error } = await db.from("avtonet_predlogi").update(patch).eq("id", id);
  if (error) return { error: `Spremembe ni bilo mogoče shraniti: ${error.message}` };

  revalidatePath("/avtonet/urejanje");
  return { success: "Shranjeno." };
}
