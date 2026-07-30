import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { queryLeads } from "@/lib/lead-intelligence/query";
import { filtersFromSearchParams } from "@/lib/lead-intelligence/filters";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
  type LeadStatus,
} from "@/lib/lead-intelligence/types";
import AiSearchBox from "./AiSearchBox";
import LeadsTableClient from "./LeadsTableClient";
import DateRangeFilter from "./DateRangeFilter";

type SearchParams = Record<string, string | string[] | undefined>;
type StatusBreakdown = Partial<Record<LeadStatus, number>>;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = filtersFromSearchParams(params);

  const supabase = createAdminClient();
  const [{ leads, total, page, totalPages }, { data: stats }] = await Promise.all([
    queryLeads(supabase, filters),
    supabase.rpc("intel_leads_dashboard_stats"),
  ]);
  const statusBreakdown = (stats?.status_breakdown ?? {}) as StatusBreakdown;
  const totalAllStatuses = Object.values(statusBreakdown).reduce(
    (sum, n) => sum + (n ?? 0),
    0
  );

  const val = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : "";
  };

  function statusTabHref(status: string) {
    const sp = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        typeof v === "string" && k !== "status" && k !== "page" ? [[k, v]] : []
      )
    );
    if (status) sp.set("status", status);
    const qs = sp.toString();
    return `/admin/lead-intelligence/leads${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Baza leadov</h1>
          <p className="mt-2 text-base text-zinc-500">
            {total.toLocaleString("sl-SI")} leadov v bazi
          </p>
        </div>
        <Link
          href="/admin/lead-intelligence/import"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          Uvozi leade
        </Link>
      </div>

      <div className="mt-6">
        <AiSearchBox />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={statusTabHref("")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
            !val("status")
              ? "bg-zinc-900 text-white"
              : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
          }`}
        >
          Vsi
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              !val("status") ? "bg-white/20" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {totalAllStatuses}
          </span>
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link
            key={s}
            href={statusTabHref(s)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
              val("status") === s
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
            }`}
          >
            {LEAD_STATUS_LABELS[s]}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                val("status") === s ? "bg-white/20" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {statusBreakdown[s] ?? 0}
            </span>
          </Link>
        ))}
      </div>

      <form
        method="get"
        className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-4 lg:grid-cols-6"
      >
        <input type="hidden" name="status" value={val("status")} />
        <input
          name="q"
          defaultValue={val("q")}
          placeholder="Iskanje po besedilu …"
          className="col-span-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none sm:col-span-2"
        />
        <input
          name="industry"
          defaultValue={val("industry")}
          placeholder="Panoga"
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <input
          name="city"
          defaultValue={val("city")}
          placeholder="Mesto"
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <input
          name="region"
          defaultValue={val("region")}
          placeholder="Regija"
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <input
          name="country"
          defaultValue={val("country")}
          placeholder="Država"
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <input
          name="tag"
          defaultValue={val("tag")}
          placeholder="Oznaka"
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <select
          name="priority"
          defaultValue={val("priority")}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        >
          <option value="">Vse prioritete</option>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {LEAD_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          name="hasWebsite"
          defaultValue={val("hasWebsite")}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        >
          <option value="">Website — vsi</option>
          <option value="true">Ima website</option>
          <option value="false">Brez websita</option>
        </select>
        <select
          name="hasEmail"
          defaultValue={val("hasEmail")}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        >
          <option value="">Email — vsi</option>
          <option value="true">Ima email</option>
          <option value="false">Brez emaila</option>
        </select>
        <select
          name="hasPhone"
          defaultValue={val("hasPhone")}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        >
          <option value="">Telefon — vsi</option>
          <option value="true">Ima telefon</option>
          <option value="false">Brez telefona</option>
        </select>

        <DateRangeFilter defaultFrom={val("createdFrom")} defaultTo={val("createdTo")} />

        <div className="col-span-2 flex items-center gap-3 sm:col-span-4 lg:col-span-6">
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Filtriraj
          </button>
          <Link
            href="/admin/lead-intelligence/leads"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Počisti filtre
          </Link>
        </div>
      </form>

      <div className="mt-6">
        <LeadsTableClient leads={leads} />
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          {(() => {
            const pageHref = (p: number) => {
              const sp = new URLSearchParams(
                Object.entries(params).flatMap(([k, v]) =>
                  typeof v === "string" && k !== "page" ? [[k, v]] : []
                )
              );
              sp.set("page", String(p));
              return `/admin/lead-intelligence/leads?${sp.toString()}`;
            };
            return (
              <>
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Prejšnja
                  </Link>
                ) : (
                  <span className="px-4 py-2 text-sm text-zinc-300">Prejšnja</span>
                )}
                <span className="text-sm text-zinc-500">
                  Stran {page} od {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Naslednja
                  </Link>
                ) : (
                  <span className="px-4 py-2 text-sm text-zinc-300">Naslednja</span>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
