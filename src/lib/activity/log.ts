import "server-only";
import { createLeadClient } from "@/lib/leadDb";
import type { ActivityType } from "./types";

/**
 * Writes a timeline entry. Never throws — logging must not block the
 * primary mutation it's attached to; failures are only logged server-side.
 */
export async function logActivity(
  leadId: string,
  type: ActivityType,
  content: string | null,
  userId: string | null
): Promise<void> {
  const admin = createLeadClient();
  const { error } = await admin.from("intel_lead_activity").insert({
    lead_id: leadId,
    type,
    content,
    created_by: userId,
  });
  if (error) {
    console.error("logActivity failed:", error.message);
  }
}
