import { Inbox, Percent, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import ResumeCard from "@/components/dashboard/ResumeCard";

export default async function AdminOverviewPage() {
  const supabase = createAdminClient();

  const [{ count: leadsCount }, { count: partnersCount }, { data: pending }] =
    await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "partner"),
      supabase.from("commissions").select("amount").eq("status", "pending"),
    ]);

  const pendingTotal = (pending ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );

  const stats = [
    { icon: Inbox, label: "Leadi iz chata", value: leadsCount ?? 0 },
    { icon: Users, label: "Partnerji", value: partnersCount ?? 0 },
    {
      icon: Percent,
      label: "Neizplačane provizije",
      value: `${pendingTotal.toFixed(2)} €`,
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Pregled</h1>
      <p className="mt-2 text-base text-zinc-500">
        Hiter povzetek leadov, partnerjev in provizij.
      </p>

      <ResumeCard />

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <stat.icon className="h-6 w-6" />
            </div>
            <p className="mt-5 text-3xl font-semibold text-zinc-900">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
