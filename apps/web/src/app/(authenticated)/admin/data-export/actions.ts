"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import { buildOrgDataExport } from "@/lib/data-export";
import type { ActionResult } from "@arbor/shared";

/**
 * Triggers a data export for the current org. Synchronously builds the ZIP
 * and uploads — for v1 we don't need a queue; the largest tenant has ~10k
 * rows total which serializes in well under the 30s server-action budget.
 *
 * If exports start timing out for large customers, swap this for a queue
 * insert + background worker (Supabase Edge Function reading data_exports
 * where status='queued').
 *
 * @requiredRole manager
 */
export async function startDataExportAction(): Promise<
  ActionResult<{ exportId: string; sizeBytes: number; tableCount: number; rowCount: number }>
> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "data_export", "startDataExport", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }

  const admin = createAdminClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Insert the export row first so we have an id to use as the storage path
  // and a queued/running status visible to anyone watching the table.
  const { data: row, error: insertErr } = await admin
    .from("data_exports")
    .insert({
      org_id: orgId,
      requested_by: user?.id ?? null,
      status: "running",
    })
    .select("id")
    .single();
  if (insertErr) {
    return { ok: false, error: { code: insertErr.code, message: insertErr.message } };
  }

  try {
    const result = await buildOrgDataExport(orgId, row.id);
    await admin
      .from("data_exports")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        storage_path: result.storagePath,
        size_bytes: result.sizeBytes,
        table_count: result.tableCount,
        row_count: result.rowCount,
      })
      .eq("id", row.id);

    await admin.from("audit_log").insert({
      org_id: orgId,
      actor_id: user?.id ?? null,
      operation: "DATA_EXPORT_COMPLETED",
      table_name: "data_exports",
      record_id: row.id,
      changed_fields: null,
      old_values: null,
      new_values: {
        sizeBytes: result.sizeBytes,
        tableCount: result.tableCount,
        rowCount: result.rowCount,
      },
    });

    revalidatePath("/admin/data-export");
    return {
      ok: true,
      data: {
        exportId: row.id,
        sizeBytes: result.sizeBytes,
        tableCount: result.tableCount,
        rowCount: result.rowCount,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    await admin
      .from("data_exports")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg })
      .eq("id", row.id);
    return { ok: false, error: { code: "EXPORT_FAILED", message: msg } };
  }
}
