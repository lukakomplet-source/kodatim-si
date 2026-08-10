"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { preberiObrazec } from "@/lib/avtonet/spremljanja";

/**
 * Creating, editing and switching off a spremljanje.
 *
 * /avtonet is a public demo page, so every action verifies the admin role. The
 * screen hides the controls from visitors as a courtesy; this is the gate.
 *
 * A missing table is reported as itself rather than as a generic failure —
 * "poženite migracijo" is actionable, "Napaka pri shranjevanju" is not.
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

export async function shraniSpremljanje(
  _prev: SpremljanjeResult,
  formData: FormData
): Promise<SpremljanjeResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const prebrano = preberiObrazec(formData);
  if ("napaka" in prebrano) return { error: prebrano.napaka };

  const db = createAdminClient();
  const id = formData.get("id");
  const obstojeci = typeof id === "string" && id !== "" ? id : null;

  if (obstojeci) {
    const { error } = await db.from("avtonet_iskanja").update(prebrano.vnos).eq("id", obstojeci);
    if (error) return { error: napakaBaze(error.code, `Shranjevanje ni uspelo: ${error.message}`) };
  } else {
    const { error } = await db
      .from("avtonet_iskanja")
      .insert({ ...prebrano.vnos, created_by: user.id, aktivno: true });
    if (error) return { error: napakaBaze(error.code, `Shranjevanje ni uspelo: ${error.message}`) };
  }

  revalidatePath("/avtonet");
  return { success: true };
}

export async function preklopiSpremljanje(id: string, aktivno: boolean): Promise<SpremljanjeResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const db = createAdminClient();
  const { error } = await db.from("avtonet_iskanja").update({ aktivno }).eq("id", id);
  if (error) return { error: `Sprememba ni uspela: ${error.message}` };

  revalidatePath("/avtonet");
  return { success: true };
}

export async function izbrisiSpremljanje(id: string): Promise<SpremljanjeResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const db = createAdminClient();
  const { error } = await db.from("avtonet_iskanja").delete().eq("id", id);
  if (error) return { error: `Brisanje ni uspelo: ${error.message}` };

  revalidatePath("/avtonet");
  return { success: true };
}

/**
 * Marks the spremljanje as seen, which is what clears the "N novih" badge.
 *
 * Kept separate from reading the listings so the count is cleared by an
 * explicit action rather than as a side effect of rendering — a page that
 * silently marks things read on every prefetch would lose the badge before the
 * user ever saw it.
 */
export async function oznaciKotVideno(id: string): Promise<SpremljanjeResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("avtonet_iskanja")
    .update({ zadnji_ogled: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: `Označevanje ni uspelo: ${error.message}` };

  revalidatePath("/avtonet");
  return { success: true };
}
