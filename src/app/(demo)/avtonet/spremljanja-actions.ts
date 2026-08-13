"use server";

import { revalidatePath } from "next/cache";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { preberiObrazec } from "@/lib/avtonet/spremljanja";

/**
 * Creating, editing and switching off a spremljanje.
 *
 * Every action does two checks, and the second is the one that matters: is this
 * person allowed into SBN Auto at all, and does this particular watch belong to
 * them. Without the ownership check, any signed-in user could edit or delete
 * anyone else's watch just by knowing an id — the screen would never offer it,
 * but the action is a public endpoint and the screen is not the boundary.
 *
 * A missing table is reported as itself: "run the migration" is actionable,
 * "Napaka pri shranjevanju" is not.
 */

export type SpremljanjeResult = { error?: string; success?: boolean };

function napakaBaze(code: string | undefined, message: string): string {
  if (code === "PGRST205") {
    return "Baza še ni pripravljena — poženite supabase/migration_avtonet.sql.";
  }
  if (code === "PGRST204" || code === "42703") {
    return "Manjkajo stolpci za spremljanja — poženite supabase/migration_avtonet_spremljanja.sql.";
  }
  return message;
}

/** Resolves the caller, and whether they may act on this particular watch. */
async function dovoljenje(id?: string): Promise<
  { napaka: string } | { userId: string; jeAdmin: boolean; db: ReturnType<typeof createAvtonetClient> }
> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) return { napaka: "Niste prijavljeni." };

  const db = createAvtonetClient();

  if (id) {
    const { data } = await db.from("avtonet_iskanja").select("created_by").eq("id", id).maybeSingle();
    if (!data) return { napaka: "Spremljanje ne obstaja." };
    const lastnik = (data as { created_by: string | null }).created_by;
    if (!dostop.jeAdmin && lastnik !== dostop.userId) {
      return { napaka: "To spremljanje ni vaše." };
    }
  }

  return { userId: dostop.userId, jeAdmin: dostop.jeAdmin, db };
}

export async function shraniSpremljanje(
  _prev: SpremljanjeResult,
  formData: FormData
): Promise<SpremljanjeResult> {
  const id = formData.get("id");
  const obstojeci = typeof id === "string" && id !== "" ? id : null;

  const d = await dovoljenje(obstojeci ?? undefined);
  if ("napaka" in d) return { error: d.napaka };

  const prebrano = preberiObrazec(formData);
  if ("napaka" in prebrano) return { error: prebrano.napaka };

  if (obstojeci) {
    const { error } = await d.db.from("avtonet_iskanja").update(prebrano.vnos).eq("id", obstojeci);
    if (error) return { error: napakaBaze(error.code, `Shranjevanje ni uspelo: ${error.message}`) };
  } else {
    const { error } = await d.db
      .from("avtonet_iskanja")
      .insert({ ...prebrano.vnos, created_by: d.userId, aktivno: true });
    if (error) return { error: napakaBaze(error.code, `Shranjevanje ni uspelo: ${error.message}`) };
  }

  revalidatePath("/avtonet");
  return { success: true };
}

export async function preklopiSpremljanje(id: string, aktivno: boolean): Promise<SpremljanjeResult> {
  const d = await dovoljenje(id);
  if ("napaka" in d) return { error: d.napaka };

  const { error } = await d.db.from("avtonet_iskanja").update({ aktivno }).eq("id", id);
  if (error) return { error: `Sprememba ni uspela: ${error.message}` };

  revalidatePath("/avtonet");
  return { success: true };
}

export async function izbrisiSpremljanje(id: string): Promise<SpremljanjeResult> {
  const d = await dovoljenje(id);
  if ("napaka" in d) return { error: d.napaka };

  const { error } = await d.db.from("avtonet_iskanja").delete().eq("id", id);
  if (error) return { error: `Brisanje ni uspelo: ${error.message}` };

  revalidatePath("/avtonet");
  return { success: true };
}

/**
 * Marks the spremljanje as seen, which is what clears the "N novih" badge.
 *
 * Kept separate from reading the listings so the count is cleared by an explicit
 * action rather than as a side effect of rendering — a page that silently marks
 * things read on every prefetch would lose the badge before the user saw it.
 */
export async function oznaciKotVideno(id: string): Promise<SpremljanjeResult> {
  const d = await dovoljenje(id);
  if ("napaka" in d) return { error: d.napaka };

  const { error } = await d.db
    .from("avtonet_iskanja")
    .update({ zadnji_ogled: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: `Označevanje ni uspelo: ${error.message}` };

  revalidatePath("/avtonet");
  return { success: true };
}
