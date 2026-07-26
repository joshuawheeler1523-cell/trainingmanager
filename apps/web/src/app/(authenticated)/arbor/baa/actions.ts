"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireArborAdmin } from "@/lib/auth/arbor-admin";
import type { ActionResult } from "@arbor/shared";

const STATUS_VALUES = ["requested", "sent", "signed", "rejected", "expired"] as const;

const updateSchema = z.object({
  baaId: z.string().uuid(),
  status: z.enum(STATUS_VALUES),
  signerName: z
    .string()
    .max(120)
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  signerTitle: z
    .string()
    .max(120)
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  signerEmail: z
    .string()
    .email()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  notes: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

export async function updateBaaAction(input: unknown): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("baa_requests")
    .update({
      status: parsed.data.status,
      signer_name: parsed.data.signerName,
      signer_title: parsed.data.signerTitle,
      signer_email: parsed.data.signerEmail,
      effective_date: parsed.data.effectiveDate,
      notes: parsed.data.notes,
      ...(parsed.data.status === "signed" && parsed.data.effectiveDate
        ? { signed_at: new Date(parsed.data.effectiveDate + "T00:00:00Z").toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.baaId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  // Audit
  const { data: row } = await admin
    .from("baa_requests")
    .select("org_id")
    .eq("id", parsed.data.baaId)
    .maybeSingle();
  if (row) {
    const { data: userData } = await (await createClient()).auth.getUser();
    await admin.from("audit_log").insert({
      org_id: row.org_id,
      actor_id: userData.user?.id ?? null,
      operation: `ARBOR_ADMIN_BAA_${parsed.data.status.toUpperCase()}`,
      table_name: "baa_requests",
      record_id: parsed.data.baaId,
      changed_fields: null,
      old_values: null,
      new_values: parsed.data as never,
    });
  }

  revalidatePath("/arbor/baa");
  return { ok: true, data: true };
}
