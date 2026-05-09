import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Writes one row to public.audit_log capturing a FORBIDDEN denial at the
 * server-action layer. Use this whenever a `ctx()` helper rejects a request
 * for role/permission reasons.
 *
 * Operation = 'DENIED'. Table_name = the action namespace (e.g. 'admin',
 * 'workspace_settings'). Record_id = NULL. New_values jsonb encodes the
 * action name + reason.
 *
 * Failures are swallowed (the denial response is what the caller cares
 * about; an audit-log insert failure should not double-fault the request).
 *
 * @param orgId      The org context where the denial occurred.
 * @param namespace  Short string identifying the action group (admin, etc.).
 * @param action     Specific action that was denied (e.g. 'inviteUser').
 * @param reason     Why it was denied (e.g. 'role_check_failed').
 */
export async function writeAuditDenial(
  orgId: string,
  namespace: string,
  action: string,
  reason: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // record_id is NOT NULL on audit_log; denials don't have a target row, so
    // we use the org_id as the record_id (the org is what the denial is
    // scoped to). new_values carries the action + reason for queryability.
    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor_id: user?.id ?? null,
      operation: "DENIED",
      table_name: namespace,
      record_id: orgId,
      changed_fields: null,
      old_values: null,
      new_values: { action, reason },
    });
  } catch {
    // Intentionally swallow — denial response should not be blocked by an
    // audit-log insert failure. The denial itself is still returned.
  }
}
