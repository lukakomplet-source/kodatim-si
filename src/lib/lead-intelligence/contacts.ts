import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IntelLeadContact } from "./contactTypes";

export * from "./contactTypes";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getLeadContacts(admin: AdminClient, leadId: string): Promise<IntelLeadContact[]> {
  const { data, error } = await admin
    .from("intel_lead_contacts")
    .select("*")
    .eq("lead_id", leadId)
    .order("priority_rank", { ascending: true })
    .order("confidence", { ascending: false });

  if (error) {
    throw new Error(`Kontaktov ni bilo mogoče naložiti: ${error.message}`);
  }

  return (data ?? []) as IntelLeadContact[];
}
