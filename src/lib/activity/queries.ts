import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { ActivityWithAuthor } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getLeadActivity(
  admin: AdminClient,
  leadId: string
): Promise<ActivityWithAuthor[]> {
  const { data, error } = await admin
    .from("intel_lead_activity")
    .select("*, author:profiles(full_name, email)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Zgodovine aktivnosti ni bilo mogoče naložiti: ${error.message}`);
  }

  return (data ?? []) as unknown as ActivityWithAuthor[];
}
