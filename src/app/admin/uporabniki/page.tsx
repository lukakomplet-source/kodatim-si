import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import InviteUserForm from "./InviteUserForm";
import UsersTableClient from "./UsersTableClient";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("id, full_name, email, role, referral_code, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Uporabniki</h1>
      <p className="mt-2 text-base text-zinc-500">
        Vsi administratorji in partnerji z dostopom do sistema. Novega
        uporabnika povabite po emailu — sam si nastavi geslo.
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <InviteUserForm />
      </div>

      <div className="mt-10">
        <UsersTableClient
          users={users ?? []}
          currentUserId={user?.id ?? ""}
        />
      </div>
    </div>
  );
}
