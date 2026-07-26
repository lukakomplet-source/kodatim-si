import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLeadsPage() {
  const supabase = createAdminClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("id, email, phone, referral_code, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">
        Leadi iz chata
      </h1>
      <p className="mt-2 text-base text-zinc-500">
        Kontakti, ki so jih obiskovalci pustili v AI klepetu.
      </p>

      <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Telefon</th>
              <th className="px-6 py-4 font-medium">Partner</th>
              <th className="px-6 py-4 font-medium">Datum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {leads && leads.length > 0 ? (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-6 py-4 text-zinc-900">
                    {lead.email || "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">
                    {lead.phone || "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">
                    {lead.referral_code || "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(lead.created_at).toLocaleString("sl-SI")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-12 text-center text-zinc-400"
                >
                  Še ni leadov.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
