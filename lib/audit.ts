import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type AuditEntry = {
  actorId: string | null;
  actorUsername: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  oldValue?: Json | null;
  newValue?: Json | null;
};

/**
 * Writes an audit row.
 *
 * Uses the service-role client so that a record is still written for actions
 * whose actor cannot read the log — the operator who uploads data has no
 * business reading the audit trail, but their upload still has to appear in it.
 *
 * Never throws: an audit failure must not roll back the action it describes.
 * It is reported to the server log instead.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: entry.actorId,
      actor_username: entry.actorUsername,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      summary: entry.summary,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
    });
    if (error) {
      console.error("[audit] kayıt yazılamadı:", error.message);
    }
  } catch (error) {
    console.error("[audit] kayıt yazılamadı:", error);
  }
}
