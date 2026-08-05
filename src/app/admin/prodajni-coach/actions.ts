"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { KNOWLEDGE_KINDS, type KnowledgeKind } from "@/lib/salesCoachTypes";

/** CRUD for the sales knowledge base, plus the coach's selling style. */

export type KnowledgeResult = { error?: string; success?: boolean };

function parseKind(value: FormDataEntryValue | null): KnowledgeKind {
  const kind = String(value ?? "note");
  return (KNOWLEDGE_KINDS as readonly string[]).includes(kind) ? (kind as KnowledgeKind) : "note";
}

export async function saveKnowledge(_prev: KnowledgeResult, formData: FormData): Promise<KnowledgeResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title) return { error: "Vnesite naslov." };
  if (!content) return { error: "Vnesite vsebino." };

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

  const admin = createAdminClient();
  const payload = { title, content, kind: parseKind(formData.get("kind")), tags };

  const { error } = id
    ? await admin.from("sales_knowledge").update(payload).eq("id", id)
    : await admin.from("sales_knowledge").insert({ ...payload, created_by: user.id });

  if (error) {
    console.error("saveKnowledge error:", error);
    return { error: `Zapisa ni bilo mogoče shraniti: ${error.message}` };
  }

  revalidatePath("/admin/prodajni-coach");
  return { success: true };
}

export async function deleteKnowledge(id: string): Promise<KnowledgeResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("sales_knowledge").delete().eq("id", id);
  if (error) return { error: `Zapisa ni bilo mogoče izbrisati: ${error.message}` };

  revalidatePath("/admin/prodajni-coach");
  return { success: true };
}

export async function saveCoachStyle(style: string): Promise<KnowledgeResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sales_coach_settings")
    .upsert({ user_id: user.id, style: style.trim() || null, updated_at: new Date().toISOString() });

  if (error) return { error: `Sloga ni bilo mogoče shraniti: ${error.message}` };

  revalidatePath("/admin/prodajni-coach");
  return { success: true };
}
