import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

interface LogAuditEventParams {
  orgId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown> | null;
}

export async function logAuditEvent({
  orgId,
  action,
  resourceType,
  resourceId,
  metadata,
}: LogAuditEventParams) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from("audit_logs").insert({
    org_id: orgId,
    actor_id: user?.id ?? null,
    action,
    resource_type: resourceType ?? null,
    resource_id: resourceId ?? null,
    metadata: (metadata ?? null) as Json | null,
  });
}
