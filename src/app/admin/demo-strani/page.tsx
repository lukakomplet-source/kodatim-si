import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DemoStran } from "@/lib/demoStrani";
import DemoStraniClient from "./DemoStraniClient";

export const metadata = { title: "Spletne strani in aplikacije" };

export default async function DemoStraniPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("demo_strani")
    .select("*")
    .order("created_at", { ascending: false });

  // PGRST205 = the table is not there yet. Say so plainly instead of showing
  // an empty list that looks like "you have no demos".
  const migrationMissing = error?.code === "PGRST205";

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Spletne strani in aplikacije</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Izdelki za stranke, ki stojijo na vaši domeni, dokler ne gredo na strankino — vsak na svojem
        naslovu <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm">kodatim.si/&lt;slug&gt;</code>.
        Tu jih imate zbrane, odprete predogled in kopirate povezavo za stranko.
      </p>

      {migrationMissing ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Tabela <code>demo_strani</code> še ne obstaja. V Supabase SQL Editorju poženite{" "}
          <code>supabase/migration_demo_strani.sql</code>, nato osvežite to stran.
        </p>
      ) : error ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Seznama ni bilo mogoče prebrati: {error.message}
        </p>
      ) : (
        <DemoStraniClient items={(data ?? []) as unknown as DemoStran[]} />
      )}
    </div>
  );
}
