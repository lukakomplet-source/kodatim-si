import { Inbox, Percent, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ReferralLinkCard from "./ReferralLinkCard";
import PayoutDetailsForm from "./PayoutDetailsForm";

const TYPE_LABELS: Record<string, string> = {
  first_invoice: "Prva faktura (20 %)",
  monthly: "Mesečna",
};

export default async function PartnerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, referral_code, entity_type, company_name, tax_id, account_holder_name, iban, bank_name"
    )
    .eq("id", user!.id)
    .single();

  const [{ count: leadsCount }, { data: commissions }] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("referral_partner_id", user!.id),
    supabase
      .from("commissions")
      .select("id, amount, type, status, note, created_at")
      .eq("partner_id", user!.id)
      .order("created_at", { ascending: false }),
  ]);

  const paidTotal = (commissions ?? [])
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + Number(c.amount), 0);
  const pendingTotal = (commissions ?? [])
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const referralLink = `${process.env.NEXT_PUBLIC_SITE_URL}/?ref=${profile?.referral_code ?? ""}`;

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">
        Pozdravljeni, {profile?.full_name || "partner"}
      </h1>
      <p className="mt-2 text-base text-zinc-500">
        Pregled vaših priporočil in provizij.
      </p>

      <div className="mt-8">
        <ReferralLinkCard link={referralLink} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Inbox className="h-6 w-6" />
          </div>
          <p className="mt-5 text-3xl font-semibold text-zinc-900">
            {leadsCount ?? 0}
          </p>
          <p className="mt-1 text-sm text-zinc-500">Priporočenih kontaktov</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Wallet className="h-6 w-6" />
          </div>
          <p className="mt-5 text-3xl font-semibold text-zinc-900">
            {paidTotal.toFixed(2)} €
          </p>
          <p className="mt-1 text-sm text-zinc-500">Izplačano skupaj</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Percent className="h-6 w-6" />
          </div>
          <p className="mt-5 text-3xl font-semibold text-zinc-900">
            {pendingTotal.toFixed(2)} €
          </p>
          <p className="mt-1 text-sm text-zinc-500">V čakanju</p>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">
          Podatki za izplačilo
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Kam naj nakažemo vaše provizije — velja za podjetja in fizične
          osebe.
        </p>
        <div className="mt-6">
          <PayoutDetailsForm
            entityType={profile?.entity_type ?? null}
            companyName={profile?.company_name ?? null}
            taxId={profile?.tax_id ?? null}
            accountHolderName={profile?.account_holder_name ?? null}
            iban={profile?.iban ?? null}
            bankName={profile?.bank_name ?? null}
          />
        </div>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">Znesek</th>
              <th className="px-6 py-4 font-medium">Tip</th>
              <th className="px-6 py-4 font-medium">Opomba</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Datum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {commissions && commissions.length > 0 ? (
              commissions.map((commission) => (
                <tr key={commission.id}>
                  <td className="px-6 py-4 text-zinc-900">
                    {Number(commission.amount).toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 text-zinc-600">
                    {TYPE_LABELS[commission.type] ?? commission.type}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {commission.note || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        commission.status === "paid"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {commission.status === "paid"
                        ? "Izplačano"
                        : "V čakanju"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(commission.created_at).toLocaleDateString(
                      "sl-SI"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-zinc-400"
                >
                  Še ni provizij.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
