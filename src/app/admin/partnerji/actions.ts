"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";

function generateReferralCode(fullName: string) {
  const base = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `${base || "PARTNER"}${suffix}`;
}

export type InvitePartnerState = { error?: string; success?: boolean };

export async function invitePartner(
  _prevState: InvitePartnerState,
  formData: FormData
): Promise<InvitePartnerState> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !fullName) {
    return { error: "Vnesite ime in email." };
  }

  const admin = createAdminClient();
  const referralCode = generateReferralCode(fullName);

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/nastavi-geslo`,
    });

  if (inviteError || !invited.user) {
    return {
      error: inviteError?.message ?? "Povabila ni bilo mogoče poslati.",
    };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role: "partner",
      full_name: fullName,
      referral_code: referralCode,
    })
    .eq("id", invited.user.id);

  if (profileError) {
    return {
      error: "Partner je povabljen, a profila ni bilo mogoče urediti.",
    };
  }

  revalidatePath("/admin/partnerji");
  return { success: true };
}
