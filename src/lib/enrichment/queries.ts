import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IntelLead } from "@/lib/lead-intelligence/types";

type AdminClient = ReturnType<typeof createAdminClient>;

const DISCOVERY_LIMIT = 500;
const STUCK_AFTER_MINUTES = 10;

export async function getDiscoveryQueue(
  admin: AdminClient,
  opts: { importId?: string } = {}
): Promise<IntelLead[]> {
  let query = admin
    .from("intel_leads")
    .select("*")
    .neq("enrichment_status", "idle")
    .order("created_at", { ascending: false })
    .limit(DISCOVERY_LIMIT);

  if (opts.importId) query = query.eq("import_id", opts.importId);

  const { data, error } = await query;
  if (error) throw new Error(`Vrste ni bilo mogoče naložiti: ${error.message}`);
  return (data ?? []) as IntelLead[];
}

export function isStuck(lead: IntelLead): boolean {
  if (!["searching", "scraping", "analyzing"].includes(lead.enrichment_status)) return false;
  if (!lead.enrichment_started_at) return false;
  const startedAt = new Date(lead.enrichment_started_at).getTime();
  return Date.now() - startedAt > STUCK_AFTER_MINUTES * 60 * 1000;
}
