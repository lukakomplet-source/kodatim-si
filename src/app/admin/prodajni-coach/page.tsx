import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KnowledgeEntry } from "@/lib/salesCoachTypes";
import SalesCoachClient from "./SalesCoachClient";

export const metadata = { title: "Prodajni coach" };

export default async function SalesCoachPage() {
  const user = await requireAdmin();
  const admin = createAdminClient();

  const [{ data: knowledge, error }, { data: settings }] = await Promise.all([
    admin.from("sales_knowledge").select("*").order("updated_at", { ascending: false }),
    admin.from("sales_coach_settings").select("style").eq("user_id", user.id).maybeSingle(),
  ]);

  // The tables arrive with a migration the user runs by hand, so a missing
  // table is a normal state on first visit, not a crash.
  const migrationMissing = Boolean(error);

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Prodajni coach</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Vaša baza prodajnega znanja in pomočnik, ki odgovarja izključno iz nje — skripte, ugovori z
        odgovori, primeri iz prakse. Uporablja se tudi pri pisanju mailov v tematskih kampanjah.
      </p>

      {migrationMissing ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
          Tabele še ne obstajajo. V Supabase SQL Editorju poženite{" "}
          <code className="font-mono">supabase/migration_promocije_tematske.sql</code>, nato osvežite stran.
        </p>
      ) : (
        <SalesCoachClient
          entries={(knowledge ?? []) as unknown as KnowledgeEntry[]}
          style={(settings as { style?: string } | null)?.style ?? ""}
        />
      )}
    </div>
  );
}
