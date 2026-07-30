import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import ScrapeCompanyForm from "./ScrapeCompanyForm";
import AiCompanySearchForm from "./AiCompanySearchForm";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = createAdminClient();

  let query = supabase
    .from("companies")
    .select("id, name, url, industry, description, created_at")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.ilike("industry", `%${q}%`);
  }

  const { data: companies } = await query;

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Podjetja</h1>
      <p className="mt-2 text-base text-zinc-500">
        Vnesite URL podjetja — Firecrawl prebere vsebino strani, AI pa
        izlušči ime, panogo in kratek opis dejavnosti.
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <ScrapeCompanyForm />
      </div>

      <div className="mt-4">
        <AiCompanySearchForm />
      </div>

      <form className="mt-10 flex flex-wrap items-center gap-3" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Išči po panogi/niši …"
          className="w-full max-w-sm rounded-full border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
        >
          Išči
        </button>
        {q && (
          <Link
            href="/admin/podjetja"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Počisti
          </Link>
        )}
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">Ime</th>
              <th className="px-6 py-4 font-medium">Panoga</th>
              <th className="px-6 py-4 font-medium">Opis</th>
              <th className="px-6 py-4 font-medium">URL</th>
              <th className="px-6 py-4 font-medium">Dodano</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {companies && companies.length > 0 ? (
              companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-6 py-4 text-zinc-900">
                    {company.name || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                      {company.industry || "—"}
                    </span>
                  </td>
                  <td className="max-w-xs px-6 py-4 text-zinc-500">
                    {company.description || "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    <a
                      href={company.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {(() => {
                        try {
                          return new URL(company.url).hostname;
                        } catch {
                          return company.url;
                        }
                      })()}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(company.created_at).toLocaleDateString("sl-SI")}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-zinc-400"
                >
                  {q
                    ? "Ni zadetkov za to iskanje."
                    : "Še ni shranjenih podjetij."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
