import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDiscoveryQueue } from "@/lib/enrichment/queries";
import DiscoveryQueueClient from "./DiscoveryQueueClient";

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ importId?: string }>;
}) {
  const { importId } = await searchParams;
  const admin = createAdminClient();
  const leads = await getDiscoveryQueue(admin, { importId });

  return (
    <div>
      <Link
        href="/admin/lead-intelligence/import"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na AI Discovery uvoz
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-zinc-900">AI Discovery vrsta</h1>
      <p className="mt-2 max-w-2xl text-base text-zinc-500">
        Vsak lead gre skozi AJPES, CompanyWall, Bizi, spletno stran in (neobvezno) AI analizo.
        Obdelavo izvaja ločen delovni proces v ozadju, zato lahko to stran kadarkoli zaprete —
        vrsta teče naprej. Ta pogled samo prikazuje napredek in se samodejno osvežuje.
      </p>

      <DiscoveryQueueClient initialLeads={leads} importId={importId} />
    </div>
  );
}
