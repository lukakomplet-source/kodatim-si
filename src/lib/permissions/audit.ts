import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "user_created"
  | "role_assigned"
  | "permission_override_changed"
  | "status_changed"
  | "user_deleted"
  | "role_permissions_changed";

export async function writeAuditLog(entry: {
  actorId: string;
  action: AuditAction;
  targetType: "user" | "role";
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    metadata: entry.metadata ?? {},
  });
}
