"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { DEMO_STATUSI, DEMO_VRSTE, slugError, toSlug, type DemoStatus, type DemoVrsta } from "@/lib/demoStrani";

/** CRUD for the catalogue of client demo sites parked on kodatim.si/<slug>. */

export type DemoResult = { error?: string; success?: boolean };

function parseVrsta(value: FormDataEntryValue | null): DemoVrsta {
  const v = String(value ?? "spletna_stran");
  return (DEMO_VRSTE as readonly string[]).includes(v) ? (v as DemoVrsta) : "spletna_stran";
}

function parseStatus(value: FormDataEntryValue | null): DemoStatus {
  const v = String(value ?? "v_izdelavi");
  return (DEMO_STATUSI as readonly string[]).includes(v) ? (v as DemoStatus) : "v_izdelavi";
}

function text(value: FormDataEntryValue | null, max = 300): string | null {
  const t = String(value ?? "").trim();
  return t ? t.slice(0, max) : null;
}

export async function saveDemoStran(_prev: DemoResult, formData: FormData): Promise<DemoResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const id = text(formData.get("id"));
  const naziv = text(formData.get("naziv"), 160);
  if (!naziv) return { error: "Vnesite naziv." };

  // An empty slug is derived from the name, so the common case needs no typing.
  const slug = toSlug(String(formData.get("slug") ?? "").trim() || naziv);
  const badSlug = slugError(slug);
  if (badSlug) return { error: badSlug };

  const row = {
    slug,
    naziv,
    stranka: text(formData.get("stranka"), 160),
    vrsta: parseVrsta(formData.get("vrsta")),
    status: parseStatus(formData.get("status")),
    opombe: text(formData.get("opombe"), 2000),
    koncna_domena: text(formData.get("koncna_domena")),
  };

  const admin = createAdminClient();
  const { error } = id
    ? await admin.from("demo_strani").update(row).eq("id", id)
    : await admin.from("demo_strani").insert({ ...row, created_by: user.id });

  if (error) {
    // The unique index is the only thing standing between two demos and one
    // URL, so its violation gets a plain-language answer rather than a code.
    if (error.code === "23505") return { error: `Slug „${slug}“ je že v uporabi.` };
    return { error: `Shranjevanje ni uspelo: ${error.message}` };
  }

  revalidatePath("/admin/demo-strani");
  return { success: true };
}

export async function updateDemoStatus(id: string, status: string): Promise<DemoResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }
  if (!(DEMO_STATUSI as readonly string[]).includes(status)) return { error: "Neveljaven status." };

  const admin = createAdminClient();
  const { error } = await admin.from("demo_strani").update({ status }).eq("id", id);
  if (error) return { error: `Statusa ni bilo mogoče spremeniti: ${error.message}` };

  revalidatePath("/admin/demo-strani");
  return { success: true };
}

export async function deleteDemoStran(id: string): Promise<DemoResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("demo_strani").delete().eq("id", id);
  if (error) return { error: `Brisanje ni uspelo: ${error.message}` };

  revalidatePath("/admin/demo-strani");
  return { success: true };
}
