"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireArborAdmin } from "@/lib/auth/arbor-admin";
import type { Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "@arbor/shared";

/**
 * Bulk-mark a set of invoices as paid with shared payment metadata.
 * Skips invoices not in 'sent' or 'overdue' status (already paid / void).
 */
export async function bulkMarkInvoicesPaidAction(args: {
  invoiceIds: string[];
  paidAt: string;
  paidMethod: string;
  paidReference?: string;
  notes?: string;
}): Promise<ActionResult<{ count: number }>> {
  await requireArborAdmin();
  if (args.invoiceIds.length === 0) {
    return { ok: false, error: { code: "EMPTY", message: "No invoices selected" } };
  }
  const admin = createAdminClient();
  const { data: rows, error: lookupErr } = await admin
    .from("arbor_invoices")
    .select("id, total_cents, status")
    .in("id", args.invoiceIds);
  if (lookupErr) {
    return { ok: false, error: { code: lookupErr.code, message: lookupErr.message } };
  }
  const eligible = rows.filter((r) => r.status === "sent" || r.status === "overdue");

  const { error } = await admin
    .from("arbor_invoices")
    .update({
      status: "paid",
      paid_at: args.paidAt,
      paid_method: args.paidMethod as never,
      paid_reference: args.paidReference ?? null,
      paid_amount_cents: null, // total used as default
      notes: args.notes ?? null,
    })
    .in(
      "id",
      eligible.map((e) => e.id),
    );
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  // Audit each
  const { data: userData } = await (await createClient()).auth.getUser();
  for (const e of eligible) {
    await admin.from("audit_log").insert({
      org_id: e.id,
      actor_id: userData.user?.id ?? null,
      operation: "ARBOR_ADMIN_INVOICE_BULK_PAID",
      table_name: "arbor_invoices",
      record_id: e.id,
      changed_fields: null,
      old_values: null,
      new_values: { paid_at: args.paidAt, paid_method: args.paidMethod } as Json,
    });
  }

  revalidatePath("/arbor/billing");
  return { ok: true, data: { count: eligible.length } };
}

/**
 * Manually trigger the monthly invoice cron for an arbitrary period.
 * Returns one row per agency with the result. Idempotent — agencies
 * with an existing invoice for the period are skipped.
 */
export async function runMonthlyInvoicesAction(args: {
  periodStart: string;
  periodEnd: string;
}): Promise<
  ActionResult<{
    rows: Array<{
      agency_id: string;
      invoice_id: string | null;
      invoice_number: string | null;
      total_cents: number | null;
      line_count: number | null;
      skipped: boolean;
      skip_reason: string | null;
    }>;
  }>
> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("generate_monthly_invoices_for_period", {
    p_period_start: args.periodStart,
    p_period_end: args.periodEnd,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/arbor/billing");
  return {
    ok: true,
    data: { rows: data },
  };
}
