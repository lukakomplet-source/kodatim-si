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
  return `${base || "USER"}${suffix}`;
}

export type InviteUserState = { error?: string; success?: boolean };

export async function inviteUser(
  _prevState: InviteUserState,
  formData: FormData
): Promise<InviteUserState> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "partner").trim();

  if (!email || !fullName) {
    return { error: "Vnesite ime in email." };
  }
  if (role !== "admin" && role !== "partner") {
    return { error: "Neveljavna vloga." };
  }

  const admin = createAdminClient();

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
      role,
      full_name: fullName,
      ...(role === "partner"
        ? { referral_code: generateReferralCode(fullName) }
        : {}),
    })
    .eq("id", invited.user.id);

  if (profileError) {
    return {
      error: "Uporabnik je povabljen, a profila ni bilo mogoče urediti.",
    };
  }

  revalidatePath("/admin/uporabniki");
  return { success: true };
}

export type UserActionState = { error?: string; success?: boolean };

export async function updateUserRole(
  id: string,
  role: "admin" | "partner"
): Promise<UserActionState> {
  let currentUser;
  try {
    currentUser = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (currentUser.id === id) {
    return { error: "Ne moreš spremeniti vloge lastnega računa." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", id);

  if (error) {
    return { error: "Vloge ni bilo mogoče spremeniti." };
  }

  revalidatePath("/admin/uporabniki");
  return { success: true };
}

export async function deleteUser(id: string): Promise<UserActionState> {
  let currentUser;
  try {
    currentUser = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (currentUser.id === id) {
    return { error: "Ne moreš izbrisati lastnega računa." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    return { error: "Uporabnika ni bilo mogoče izbrisati." };
  }

  revalidatePath("/admin/uporabniki");
  return { success: true };
}
