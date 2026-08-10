import { redirect } from "next/navigation";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { createAdminClient } from "@/lib/supabase/admin";
import { UporabnikiClient, type Vrstica } from "./UporabnikiClient";

/**
 * Who may use SBN Auto.
 *
 * The list joins the access rows to profiles for the name and address, because
 * a table of UUIDs is unusable — an admin needs to recognise the person they are
 * about to cut off.
 */

export const dynamic = "force-dynamic";

export default async function UporabnikiPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/avtonet/uporabniki"));
  if (!dostop.jeAdmin) redirect("/avtonet");

  const db = createAdminClient();
  const { data, error } = await db
    .from("avtonet_uporabniki")
    .select("id, uporabnik, vloga, aktiven, obvestila_email, created_at, profiles:uporabnik (email, full_name)")
    .order("created_at", { ascending: false });

  const vrstice = ((data ?? []) as unknown as {
    id: string;
    uporabnik: string;
    vloga: string;
    aktiven: boolean;
    obvestila_email: string | null;
    created_at: string;
    profiles: { email: string | null; full_name: string | null } | null;
  }[]).map<Vrstica>((v) => ({
    id: v.id,
    vloga: v.vloga,
    aktiven: v.aktiven,
    obvestilaEmail: v.obvestila_email,
    createdAt: v.created_at,
    email: v.profiles?.email ?? "(neznan e-naslov)",
    ime: v.profiles?.full_name ?? null,
  }));

  return (
    <UporabnikiClient
      vrstice={vrstice}
      migracijaManjka={error?.code === "PGRST205"}
      napaka={error && error.code !== "PGRST205" ? error.message : null}
    />
  );
}
