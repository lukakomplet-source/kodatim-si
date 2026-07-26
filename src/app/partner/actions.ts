"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PayoutDetailsState = { error?: string; success?: boolean };

export async function updatePayoutDetails(
  _prevState: PayoutDetailsState,
  formData: FormData
): Promise<PayoutDetailsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Niste prijavljeni." };
  }

  const entityType = String(formData.get("entityType") ?? "");
  const companyName = String(formData.get("companyName") ?? "").trim();
  const taxId = String(formData.get("taxId") ?? "").trim();
  const accountHolderName = String(
    formData.get("accountHolderName") ?? ""
  ).trim();
  const iban = String(formData.get("iban") ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const bankName = String(formData.get("bankName") ?? "").trim();

  if (entityType !== "company" && entityType !== "individual") {
    return { error: "Izberite vrsto (podjetje ali fizična oseba)." };
  }
  if (entityType === "company" && !companyName) {
    return { error: "Vnesite naziv podjetja." };
  }
  if (!accountHolderName) {
    return { error: "Vnesite ime imetnika računa." };
  }
  if (!iban || iban.length < 10) {
    return { error: "Vnesite veljaven IBAN." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      entity_type: entityType,
      company_name: entityType === "company" ? companyName : null,
      tax_id: taxId || null,
      account_holder_name: accountHolderName,
      iban,
      bank_name: bankName || null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Podatkov ni bilo mogoče shraniti. Poskusite znova." };
  }

  revalidatePath("/partner");
  revalidatePath("/admin/partnerji");
  return { success: true };
}
