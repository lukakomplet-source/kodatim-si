import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { LEAD_STATUS_LABELS, LEAD_PRIORITY_LABELS } from "@/lib/lead-intelligence/types";

export default function CompanyInfoCard({ lead }: { lead: IntelLead }) {
  const address = [lead.address_street, lead.address_city, lead.address_region, lead.address_country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">Podatki podjetja</h3>
        <div className="flex gap-1.5">
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            {LEAD_STATUS_LABELS[lead.lead_status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
            {LEAD_PRIORITY_LABELS[lead.priority]}
          </span>
        </div>
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        {lead.website && (
          <div>
            <dt className="text-xs text-zinc-400">Website</dt>
            <dd>
              <a
                href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {lead.website}
              </a>
            </dd>
          </div>
        )}
        {lead.email && (
          <div>
            <dt className="text-xs text-zinc-400">Email</dt>
            <dd className="text-zinc-900">{lead.email}</dd>
          </div>
        )}
        {lead.phone && (
          <div>
            <dt className="text-xs text-zinc-400">Telefon</dt>
            <dd className="text-zinc-900">{lead.phone}</dd>
          </div>
        )}
        {address && (
          <div>
            <dt className="text-xs text-zinc-400">Naslov</dt>
            <dd className="text-zinc-900">{address}</dd>
          </div>
        )}
        {lead.vat_id && (
          <div>
            <dt className="text-xs text-zinc-400">ID za DDV</dt>
            <dd className="text-zinc-900">{lead.vat_id}</dd>
          </div>
        )}
        {lead.contact_person && (
          <div>
            <dt className="text-xs text-zinc-400">Kontaktna oseba</dt>
            <dd className="text-zinc-900">{lead.contact_person}</dd>
          </div>
        )}
        {lead.industry && (
          <div>
            <dt className="text-xs text-zinc-400">Panoga</dt>
            <dd className="text-zinc-900">{lead.industry}</dd>
          </div>
        )}
        {lead.notes && (
          <div>
            <dt className="text-xs text-zinc-400">Opombe</dt>
            <dd className="whitespace-pre-wrap text-zinc-700">{lead.notes}</dd>
          </div>
        )}
      </dl>

      <Link
        href={`/admin/lead-intelligence/leads/${lead.id}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        Uredi v Lead Intelligence
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
