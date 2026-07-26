import { createAdminClient } from "@/lib/supabase/admin";
import AddCommissionForm from "./AddCommissionForm";
import { markCommissionPaid } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  first_invoice: "Prva faktura (20 %)",
  monthly: "Mesečna",
};

export default async function AdminCommissionsPage() {
  const supabase = createAdminClient();

  const [{ data: partners }, { data: commissions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "partner")
      .order("full_name"),
    supabase
      .from("commissions")
      .select(
        "id, amount, type, status, note, created_at, profiles!commissions_partner_id_fkey(full_name, email)"
      )
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Provizije</h1>
      <p className="mt-2 text-base text-zinc-500">
        Ročno beleženje provizij glede na dejansko izdane in plačane fakture.
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <AddCommissionForm partners={partners ?? []} />
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">Partner</th>
              <th className="px-6 py-4 font-medium">Znesek</th>
              <th className="px-6 py-4 font-medium">Tip</th>
              <th className="px-6 py-4 font-medium">Opomba</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {commissions && commissions.length > 0 ? (
              commissions.map((commission) => {
                const partner = Array.isArray(commission.profiles)
                  ? commission.profiles[0]
                  : commission.profiles;
                return (
                  <tr key={commission.id}>
                    <td className="px-6 py-4 text-zinc-900">
                      {partner?.full_name || partner?.email || "—"}
                    </td>
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
                    <td className="px-6 py-4 text-right">
                      {commission.status !== "paid" && (
                        <form action={markCommissionPaid}>
                          <input
                            type="hidden"
                            name="id"
                            value={commission.id}
                          />
                          <button
                            type="submit"
                            className="text-sm font-medium text-accent hover:underline"
                          >
                            Označi kot izplačano
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
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
