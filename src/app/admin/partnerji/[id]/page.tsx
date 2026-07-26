import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Inbox, Percent, User, Wallet } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import ReferralLinkCard from "@/app/partner/ReferralLinkCard";

const TYPE_LABELS: Record<string, string> = {
  first_invoice: "Prva faktura (20 %)",
  monthly: "Mesečna",
};

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, email, referral_code, entity_type, company_name, tax_id, account_holder_name, iban, bank_name"
    )
    .eq("id", id)
    .eq("role", "partner")
    .single();

  if (!profile) {
    notFound();
  }

  const [{ count: leadsCount }, { data: commissions }] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("referral_partner_id", id),
    supabase
      .from("commissions")
      .select("id, amount, type, status, note, created_at")
      .eq("partner_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const paidTotal = (commissions ?? [])
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + Number(c.amount), 0);
  const pendingTotal = (commissions ?? [])
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const referralLink = `${process.env.NEXT_PUBLIC_SITE_URL}/?ref=${profile.referral_code ?? ""}`;

  return (
    <div>
      <Link
        href="/admin/partnerji"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na partnerje
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-zinc-900">
        {profile.full_name || profile.email}
      </h1>
      <p className="mt-2 text-base text-zinc-500">
        Pogled na to, kar ta partner vidi v svojem portalu — samo za branje.
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
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          {profile.entity_type === "company" ? (
            <Building2 className="h-5 w-5 text-accent" />
          ) : (
            <User className="h-5 w-5 text-accent" />
          )}
          Podatki za izplačilo
        </h2>
        {profile.iban ? (
          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Vrsta
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">
                {profile.entity_type === "company"
                  ? "Podjetje"
                  : "Fizična oseba"}
              </dd>
            </div>
            {profile.entity_type === "company" && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Naziv podjetja
                </dt>
                <dd className="mt-1 text-sm text-zinc-900">
                  {profile.company_name || "—"}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                {profile.entity_type === "company"
                  ? "Odgovorna oseba"
                  : "Ime in priimek"}
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">
                {profile.account_holder_name || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Davčna številka
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">
                {profile.tax_id || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                IBAN
              </dt>
              <dd className="mt-1 font-mono text-sm text-zinc-900">
                {profile.iban}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Banka
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">
                {profile.bank_name || "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">
            Partner še ni vnesel podatkov za izplačilo.
          </p>
        )}
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
