"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";

export type AddCommissionState = { error?: string; success?: boolean };

export async function addCommission(
  _prevState: AddCommissionState,
  formData: FormData
): Promise<AddCommissionState> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const partnerId = String(formData.get("partnerId") ?? "");
  const amount = Number(formData.get("amount"));
  const type = String(formData.get("type") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!partnerId || !amount || amount <= 0) {
    return { error: "Izberite partnerja in vnesite veljaven znesek." };
  }
  if (type !== "first_invoice" && type !== "monthly") {
    return { error: "Neveljaven tip provizije." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("commissions").insert({
    partner_id: partnerId,
    amount,
    type,
    note: note || null,
  });

  if (error) {
    return { error: "Provizije ni bilo mogoče shraniti." };
  }

  revalidatePath("/admin/provizije");
  return { success: true };
}

export async function markCommissionPaid(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("commissions").update({ status: "paid" }).eq("id", id);

  revalidatePath("/admin/provizije");
}
