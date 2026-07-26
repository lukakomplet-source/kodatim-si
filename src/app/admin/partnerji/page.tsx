import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import InvitePartnerForm from "./InvitePartnerForm";

export default async function AdminPartnersPage() {
  const supabase = createAdminClient();
  const { data: partners } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, referral_code, created_at, entity_type, company_name, iban"
    )
    .eq("role", "partner")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Partnerji</h1>
      <p className="mt-2 text-base text-zinc-500">
        Dodajte novega partnerja — po email povabilu si sam nastavi geslo.
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <InvitePartnerForm />
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">Ime</th>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Referal koda</th>
              <th className="px-6 py-4 font-medium">IBAN za izplačilo</th>
              <th className="px-6 py-4 font-medium">Dodan</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {partners && partners.length > 0 ? (
              partners.map((partner) => (
                <tr key={partner.id}>
                  <td className="px-6 py-4 text-zinc-900">
                    {partner.full_name || "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">
                    {partner.email}
                  </td>
                  <td className="px-6 py-4">
                    <code className="rounded bg-zinc-100 px-2.5 py-1.5 text-sm text-zinc-700">
                      {partner.referral_code}
                    </code>
                  </td>
                  <td className="px-6 py-4 text-zinc-600">
                    {partner.iban ? (
                      <span className="font-mono text-xs">
                        {partner.iban}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Ni vneseno</span>
                    )}
                    {partner.entity_type && (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
                        {partner.entity_type === "company"
                          ? partner.company_name || "Podjetje"
                          : "Fizična oseba"}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(partner.created_at).toLocaleDateString("sl-SI")}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/partnerji/${partner.id}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Poglej
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-zinc-400"
                >
                  Še ni partnerjev.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
