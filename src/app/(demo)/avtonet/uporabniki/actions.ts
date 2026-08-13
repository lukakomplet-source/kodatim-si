"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { povezavaZaVabilo } from "@/lib/javniNaslov";

/**
 * Granting and revoking access to SBN Auto.
 *
 * No passwords are set here. Adding someone creates a Supabase Auth user if one
 * does not exist and sends them an invitation; THEY choose the password, through
 * Supabase, and we never see it. That is the same path the KodaTim admin already
 * uses (src/app/admin/uporabniki/actions.ts) — one way in, one place where
 * account security lives.
 *
 * Access is revoked by deactivating the row rather than deleting the auth user:
 * a person may have access to other parts of KodaTim, and losing your whole
 * account because someone removed you from one demo would be a nasty surprise.
 */

export type UporabnikResult = { error?: string; success?: string };

async function zahtevajAdmina(): Promise<{ napaka: string } | { userId: string }> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin || !dostop.userId) return { napaka: "Nimate dovoljenja za to dejanje." };
  return { userId: dostop.userId };
}

export async function dodajUporabnika(
  _prev: UporabnikResult,
  formData: FormData
): Promise<UporabnikResult> {
  const kdo = await zahtevajAdmina();
  if ("napaka" in kdo) return { error: kdo.napaka };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const vloga = String(formData.get("vloga") ?? "stranka");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Vnesite veljaven e-naslov." };
  if (!["stranka", "admin"].includes(vloga)) return { error: "Neveljavna vloga." };

  const admin = createAdminClient();

  // Already a KodaTim account? Then this is only a matter of granting access —
  // inviting again would send a confusing "set your password" mail to someone
  // who already has one.
  const { data: obstojeci } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  let userId = (obstojeci as { id: string } | null)?.id ?? null;
  let povabljen = false;

  if (!userId) {
    // The redirect must be explicit and public. Without it Supabase falls back
    // to its project Site URL, which is localhost in this project — an invited
    // user then receives a link to their OWN machine and cannot get in.
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: povezavaZaVabilo("/nastavi-geslo"),
    });
    if (inviteError || !invited?.user) {
      return { error: `Vabila ni bilo mogoče poslati: ${inviteError?.message ?? "neznana napaka"}` };
    }
    userId = invited.user.id;
    povabljen = true;
  }

  const avtonet = createAvtonetClient();
  const { error } = await avtonet.from("avtonet_uporabniki").upsert(
    {
      uporabnik: userId,
      vloga,
      aktiven: true,
      dodal: kdo.userId,
    },
    { onConflict: "uporabnik" }
  );

  if (error) {
    if (error.code === "PGRST205") {
      return { error: "Poženite supabase/migration_avtonet_uporabniki.sql." };
    }
    if (error.code === "23503") {
      return {
        error:
          "Uporabnik še nima profila v KodaTim. Ko potrdi vabilo in se prvič prijavi, ga dodajte znova.",
      };
    }
    return { error: `Dostopa ni bilo mogoče dodeliti: ${error.message}` };
  }

  revalidatePath("/avtonet/uporabniki");
  return {
    success: povabljen
      ? `Vabilo poslano na ${email}. Geslo si nastavi sam prek povezave v e-pošti.`
      : `${email} ima zdaj dostop do SBN Auto.`,
  };
}

export async function spremeniVlogo(id: string, vloga: string): Promise<UporabnikResult> {
  const kdo = await zahtevajAdmina();
  if ("napaka" in kdo) return { error: kdo.napaka };
  if (!["stranka", "admin"].includes(vloga)) return { error: "Neveljavna vloga." };

  const avtonet = createAvtonetClient();
  const { error } = await avtonet.from("avtonet_uporabniki").update({ vloga }).eq("id", id);
  if (error) return { error: `Spremembe ni bilo mogoče shraniti: ${error.message}` };

  revalidatePath("/avtonet/uporabniki");
  return { success: "Vloga spremenjena." };
}

export async function preklopiDostop(id: string, aktiven: boolean): Promise<UporabnikResult> {
  const kdo = await zahtevajAdmina();
  if ("napaka" in kdo) return { error: kdo.napaka };

  const avtonet = createAvtonetClient();
  const { error } = await avtonet.from("avtonet_uporabniki").update({ aktiven }).eq("id", id);
  if (error) return { error: `Spremembe ni bilo mogoče shraniti: ${error.message}` };

  revalidatePath("/avtonet/uporabniki");
  return { success: aktiven ? "Dostop vrnjen." : "Dostop odvzet." };
}

/**
 * Sends the person a fresh link to get in.
 *
 * Two things make this more than a one-liner.
 *
 * `inviteUserByEmail` refuses an address that already exists, which is exactly
 * the case here — the account was created by the first invite. The working path
 * for "let them in again" is a password-reset mail, which for someone who never
 * set one is simply a set-your-password link.
 *
 * And it checks BEFORE sending. Supabase validates `redirectTo` against its own
 * allow-list and silently substitutes its Site URL when the address is not
 * listed; that is how an invited user ended up with a link to localhost. An
 * invite is single-use, so sending a second broken one costs the person another
 * failed attempt. `generateLink` renders the same URL without emailing anybody,
 * so the redirect can be read first and the send refused with an actionable
 * message instead.
 */
export async function posljiVabiloZnova(id: string): Promise<UporabnikResult> {
  const kdo = await zahtevajAdmina();
  if ("napaka" in kdo) return { error: kdo.napaka };

  const admin = createAdminClient();
  const avtonet = createAvtonetClient();

  // avtonet_uporabniki lives in the avtonet DB, the email in profiles on the
  // main Supabase — so the old single embedded join is now two reads.
  const { data: vrstica } = await avtonet
    .from("avtonet_uporabniki")
    .select("uporabnik")
    .eq("id", id)
    .maybeSingle();
  const uporabnikId = (vrstica as { uporabnik: string } | null)?.uporabnik;
  if (!uporabnikId) return { error: "Uporabnik ne obstaja." };

  const { data: profil } = await admin.from("profiles").select("email").eq("id", uporabnikId).maybeSingle();
  const email = (profil as { email: string | null } | null)?.email;
  if (!email) return { error: "Za tega uporabnika ni znanega e-naslova." };

  const cilj = povezavaZaVabilo("/nastavi-geslo");

  // Dry run: what URL would the mail actually carry?
  const { data: preizkus, error: napakaPreizkusa } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: cilj },
  });
  if (napakaPreizkusa) {
    return { error: `Povezave ni bilo mogoče pripraviti: ${napakaPreizkusa.message}` };
  }

  const povezava = preizkus?.properties?.action_link ?? "";
  const kamVodi = (() => {
    try {
      return new URL(povezava).searchParams.get("redirect_to") ?? "";
    } catch {
      return "";
    }
  })();

  if (/localhost|127\.0\.0\.1/.test(kamVodi)) {
    return {
      error:
        "Nisem poslal — Supabase bi povezavo še vedno preusmeril na localhost, ki je prejemnikov lasten računalnik. V Supabase → Authentication → URL Configuration nastavite Site URL na https://www.kodatim.si in med Redirect URLs dodajte https://www.kodatim.si/** . Nato poskusite znova.",
    };
  }

  // Config is sound — now actually send.
  const anon = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo: cilj });
  if (error) return { error: `Pošiljanje ni uspelo: ${error.message}` };

  return { success: `Povezava za prijavo poslana na ${email}.` };
}

/**
 * Sets a password for someone who already has an account.
 *
 * The reason this exists: an invite link both authenticates and redirects, so a
 * person whose redirect was misconfigured ends up with a confirmed account, a
 * consumed invite, and no password — able to be "signed in" once and never able
 * to log in again. Re-sending a link cannot fix that while the redirect is still
 * wrong, and this can, without touching any dashboard.
 *
 * The password is chosen and typed by the admin, never generated or shown by us,
 * and it is not written to any log or return value. `email_confirm` is set at the
 * same time so a half-finished invite cannot leave the account unusable.
 */
export async function nastaviGeslo(id: string, geslo: string): Promise<UporabnikResult> {
  const kdo = await zahtevajAdmina();
  if ("napaka" in kdo) return { error: kdo.napaka };

  if (geslo.length < 8) return { error: "Geslo naj ima vsaj 8 znakov." };

  const admin = createAdminClient();
  const avtonet = createAvtonetClient();
  const { data: vrstica } = await avtonet
    .from("avtonet_uporabniki")
    .select("uporabnik")
    .eq("id", id)
    .maybeSingle();

  const uporabnikId = (vrstica as { uporabnik: string } | null)?.uporabnik;
  if (!uporabnikId) return { error: "Uporabnik ne obstaja." };

  const { data: profil } = await admin.from("profiles").select("email").eq("id", uporabnikId).maybeSingle();
  const email = (profil as { email: string | null } | null)?.email;

  const { error } = await admin.auth.admin.updateUserById(uporabnikId, {
    password: geslo,
    email_confirm: true,
  });
  if (error) return { error: `Gesla ni bilo mogoče nastaviti: ${error.message}` };

  revalidatePath("/avtonet/uporabniki");
  return {
    success: `Geslo nastavljeno za ${email ?? "uporabnika"}. Sporočite mu ga po varni poti — mi ga nikjer ne shranimo in ga ne moremo znova prikazati.`,
  };
}

/**
 * Removes the SBN Auto access row. The person's KodaTim account stays — this
 * screen manages access to one product, not the existence of an account.
 */
export async function odstraniUporabnika(id: string): Promise<UporabnikResult> {
  const kdo = await zahtevajAdmina();
  if ("napaka" in kdo) return { error: kdo.napaka };

  const avtonet = createAvtonetClient();
  const { error } = await avtonet.from("avtonet_uporabniki").delete().eq("id", id);
  if (error) return { error: `Brisanje ni uspelo: ${error.message}` };

  revalidatePath("/avtonet/uporabniki");
  return { success: "Uporabnik odstranjen iz SBN Auto." };
}
