import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

interface LogAuditEventParams {
  orgId: string;
  operation: string;
  tableName: string;
  recordId: string;
  oldData?: Json | null;
  newData?: Json | null;
}

export async function logAuditEvent({
  orgId,
  operation,
  tableName,
  recordId,
  oldData,
  newData,
}: LogAuditEventParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("audit_log").insert({
    org_id: orgId,
    actor_id: user?.id ?? null,
    operation,
    table_name: tableName,
    record_id: recordId,
    ...(oldData !== undefined ? { old_values: oldData } : {}),
    ...(newData !== undefined ? { new_values: newData } : {}),
  });
}
