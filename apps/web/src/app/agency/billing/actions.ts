"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAgencyId, isAgencyAdmin } from "@/lib/auth/agency";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import type { ActionResult } from "@arbor/shared";

function validationError(err: {
  errors: Array<{ message: string; path: (string | number)[] }>;
}): ActionResult<never> {
  const first = err.errors[0];
  const field = first?.path.join(".");
  return {
    ok: false,
    error: {
      code: "VALIDATION",
      message: first?.message ?? "Invalid input",
      ...(field ? { field } : {}),
    },
  };
}

/**
 * Returns true if the calling user is in the ARBOR_ADMIN_USER_IDS env list.
 * v1 implementation of "Arbor admin powers" — markInvoicePaid + invoice
 * generation are NOT agency_admin operations; they're internal to Arbor.
 * A proper Arbor admin role + console can land in v2.
 */
async function isArborAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const list = (process.env["ARBOR_ADMIN_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(user.id);
}

// ── Client contracts: agency_admin operations ───────────────────────────────

const PRICING_TIER_VALUES = ["small", "medium", "large", "enterprise"] as const;
const CONTRACT_STATUS_VALUES = ["trial", "active", "expired", "cancelled"] as const;

const createContractSchema = z.object({
  orgId: z.string().uuid("Invalid org id"),
  pricingTier: z.enum(PRICING_TIER_VALUES),
  annualContractValueCents: z
    .number()
    .int("Must be a whole number of cents")
    .min(0, "Cannot be negative"),
  revenueSharePct: z.number().int("Use basis points (3000 = 30.00%)").min(0).max(10000).nullish(),
  contractStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  contractEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .nullish(),
  status: z.enum(CONTRACT_STATUS_VALUES).default("trial"),
  notes: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

/**
 * Create a new contract for a client org under the caller's agency.
 *
 * @requiredAgencyRole agency_admin
 */
export async function createClientContractAction(
  input: unknown,
): Promise<ActionResult<{ contractId: string }>> {
  const parsed = createContractSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency_billing", "createClientContract", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();

  // Verify the org belongs to this agency before allowing a contract.
  const { data: org } = await admin
    .from("organizations")
    .select("id, agency_id, name")
    .eq("id", parsed.data.orgId)
    .maybeSingle();
  if (!org || org.agency_id !== agencyId) {
    return {
      ok: false,
      error: { code: "ORG_NOT_IN_AGENCY", message: "That org doesn't belong to your agency" },
    };
  }

  const { data: contract, error } = await admin
    .from("client_contracts")
    .insert({
      agency_id: agencyId,
      org_id: parsed.data.orgId,
      pricing_tier: parsed.data.pricingTier,
      annual_contract_value_cents: parsed.data.annualContractValueCents,
      revenue_share_pct: parsed.data.revenueSharePct ?? null,
      contract_start: parsed.data.contractStart,
      contract_end: parsed.data.contractEnd ?? null,
      status: parsed.data.status,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  // Audit entry — link to the org being contracted, not the agency, so the
  // audit_log RLS (org-member visibility) makes sense.
  await admin.from("audit_log").insert({
    org_id: parsed.data.orgId,
    actor_id: (await (await createClient()).auth.getUser()).data.user?.id ?? null,
    operation: "AGENCY_CONTRACT_CREATED",
    table_name: "client_contracts",
    record_id: contract.id,
    changed_fields: null,
    old_values: null,
    new_values: {
      agency_id: agencyId,
      pricing_tier: parsed.data.pricingTier,
      annual_value_cents: parsed.data.annualContractValueCents,
      status: parsed.data.status,
    } as unknown as Json,
  });

  revalidatePath("/agency/billing");
  revalidatePath("/agency/clients");
  return { ok: true, data: { contractId: contract.id } };
}

const updateContractSchema = z.object({
  contractId: z.string().uuid(),
  pricingTier: z.enum(PRICING_TIER_VALUES).optional(),
  annualContractValueCents: z.number().int().min(0).optional(),
  revenueSharePct: z.number().int().min(0).max(10000).nullish(),
  contractStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  contractEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  status: z.enum(CONTRACT_STATUS_VALUES).optional(),
  notes: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

/** @requiredAgencyRole agency_admin */
export async function updateClientContractAction(
  input: unknown,
): Promise<ActionResult<{ contractId: string }>> {
  const parsed = updateContractSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency_billing", "updateClientContract", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();

  // Verify contract belongs to this agency
  const { data: existing } = await admin
    .from("client_contracts")
    .select("id, agency_id, org_id")
    .eq("id", parsed.data.contractId)
    .maybeSingle();
  if (!existing || existing.agency_id !== agencyId) {
    return {
      ok: false,
      error: { code: "CONTRACT_NOT_IN_AGENCY", message: "Contract not found in your agency" },
    };
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.pricingTier !== undefined) patch["pricing_tier"] = parsed.data.pricingTier;
  if (parsed.data.annualContractValueCents !== undefined)
    patch["annual_contract_value_cents"] = parsed.data.annualContractValueCents;
  if (parsed.data.revenueSharePct !== undefined)
    patch["revenue_share_pct"] = parsed.data.revenueSharePct;
  if (parsed.data.contractStart !== undefined) patch["contract_start"] = parsed.data.contractStart;
  if (parsed.data.contractEnd !== undefined) patch["contract_end"] = parsed.data.contractEnd;
  if (parsed.data.status !== undefined) patch["status"] = parsed.data.status;
  // notes is parsed as `string | null` (zod transform); always include it
  patch["notes"] = parsed.data.notes;

  if (Object.keys(patch).length === 0) {
    return { ok: true, data: { contractId: parsed.data.contractId } };
  }

  const { error } = await admin
    .from("client_contracts")
    .update(patch as unknown as TablesUpdate<"client_contracts">)
    .eq("id", parsed.data.contractId);
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  revalidatePath("/agency/billing");
  revalidatePath("/agency/clients");
  return { ok: true, data: { contractId: parsed.data.contractId } };
}

// ── Invoices: Arbor admin operations ────────────────────────────────────────

const generateInvoiceSchema = z.object({
  agencyId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Manually generate an invoice for an agency for a given period. Uses the
 * calculate_period_rev_share() helper to determine line items and total.
 *
 * Status starts as 'draft'. Arbor admin can later mark it 'sent' (by emailing
 * the PDF) and 'paid' (when payment is received).
 *
 * Idempotency: if an invoice already exists for this (agency_id, period_start,
 * period_end), returns it instead of creating a duplicate.
 *
 * @requiredArborAdmin true
 */
export async function generateInvoiceNowAction(
  input: unknown,
): Promise<ActionResult<{ invoiceId: string; invoiceNumber: string; totalCents: number }>> {
  const parsed = generateInvoiceSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  if (!(await isArborAdmin())) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Arbor admin only. Add your user id to ARBOR_ADMIN_USER_IDS env var.",
      },
    };
  }

  const admin = createAdminClient();

  // Idempotency: check for existing invoice matching the period
  const { data: existing } = await admin
    .from("arbor_invoices")
    .select("id, invoice_number, total_cents")
    .eq("agency_id", parsed.data.agencyId)
    .eq("period_start", parsed.data.periodStart)
    .eq("period_end", parsed.data.periodEnd)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      data: {
        invoiceId: existing.id,
        invoiceNumber: existing.invoice_number,
        totalCents: existing.total_cents,
      },
    };
  }

  // Calculate line items via the SQL helper
  const { data: lineItems, error: calcErr } = await admin.rpc("calculate_period_rev_share", {
    p_agency_id: parsed.data.agencyId,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
  });
  if (calcErr) {
    return { ok: false, error: { code: calcErr.code, message: calcErr.message } };
  }

  const totalCents = lineItems.reduce<number>((sum, item) => sum + item.period_share_cents, 0);

  // Get agency for payment terms
  const { data: agency } = await admin
    .from("agencies")
    .select("payment_terms_days")
    .eq("id", parsed.data.agencyId)
    .maybeSingle();
  const termsDays = agency?.payment_terms_days ?? 30;

  // Compute due date: period_end + payment_terms_days
  const periodEnd = new Date(parsed.data.periodEnd + "T00:00:00Z");
  const dueDate = new Date(periodEnd.getTime() + termsDays * 24 * 60 * 60 * 1000);
  const dueAt = dueDate.toISOString().slice(0, 10);

  // Get next invoice number
  const { data: invoiceNumber, error: numErr } = await admin.rpc("next_invoice_number");
  if (numErr || !invoiceNumber) {
    return {
      ok: false,
      error: {
        code: numErr?.code ?? "NUM_FAILED",
        message: numErr?.message ?? "Could not generate invoice number",
      },
    };
  }

  const { data: invoice, error: insertErr } = await admin
    .from("arbor_invoices")
    .insert({
      invoice_number: invoiceNumber,
      agency_id: parsed.data.agencyId,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      due_at: dueAt,
      total_cents: totalCents,
      status: "draft",
      payment_provider: "manual",
      line_items: lineItems as unknown as Json,
    })
    .select("id, invoice_number")
    .single();
  if (insertErr) {
    return { ok: false, error: { code: insertErr.code, message: insertErr.message } };
  }

  // Audit on the agency context (use any of the agency's orgs for audit_log.org_id
  // since audit_log requires non-null org_id; we use the first contract's org if any,
  // else fall back to a synthetic uuid). Cleaner: write to audit_log without org_id
  // would require schema change; for v1 we link to the first contract's org_id.
  if (lineItems.length > 0 && lineItems[0]) {
    await admin.from("audit_log").insert({
      org_id: lineItems[0].org_id,
      actor_id: null,
      operation: "ARBOR_INVOICE_GENERATED",
      table_name: "arbor_invoices",
      record_id: invoice.id,
      changed_fields: null,
      old_values: null,
      new_values: {
        invoice_number: invoiceNumber,
        agency_id: parsed.data.agencyId,
        period_start: parsed.data.periodStart,
        period_end: parsed.data.periodEnd,
        total_cents: totalCents,
      } as unknown as Json,
    });
  }

  revalidatePath("/agency/billing");
  return {
    ok: true,
    data: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, totalCents },
  };
}

const PAYMENT_METHOD_VALUES = ["check", "wire", "ach", "zelle", "paypal", "other"] as const;

const markPaidSchema = z.object({
  invoiceId: z.string().uuid(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  paidMethod: z.enum(PAYMENT_METHOD_VALUES),
  paidReference: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  paidAmountCents: z.number().int().min(0).optional(),
  notes: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

/**
 * Record payment of an invoice. Status flips to 'paid'.
 *
 * @requiredArborAdmin true
 */
export async function markInvoicePaidAction(
  input: unknown,
): Promise<ActionResult<{ invoiceId: string }>> {
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  if (!(await isArborAdmin())) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Arbor admin only." },
    };
  }

  const admin = createAdminClient();

  const { data: invoice, error: getErr } = await admin
    .from("arbor_invoices")
    .select("id, status, total_cents, agency_id")
    .eq("id", parsed.data.invoiceId)
    .maybeSingle();
  if (getErr || !invoice) {
    return {
      ok: false,
      error: { code: getErr?.code ?? "NOT_FOUND", message: getErr?.message ?? "Invoice not found" },
    };
  }

  if (invoice.status === "paid") {
    return { ok: true, data: { invoiceId: invoice.id } };
  }

  const paidAt = new Date(parsed.data.paidAt + "T00:00:00Z").toISOString();
  const { error: updErr } = await admin
    .from("arbor_invoices")
    .update({
      status: "paid",
      paid_at: paidAt,
      paid_method: parsed.data.paidMethod,
      paid_reference: parsed.data.paidReference,
      paid_amount_cents: parsed.data.paidAmountCents ?? invoice.total_cents,
      notes: parsed.data.notes,
    })
    .eq("id", parsed.data.invoiceId);
  if (updErr) {
    return { ok: false, error: { code: updErr.code, message: updErr.message } };
  }

  revalidatePath("/agency/billing");
  revalidatePath(`/agency/billing/${parsed.data.invoiceId}`);
  return { ok: true, data: { invoiceId: parsed.data.invoiceId } };
}

const markVoidSchema = z.object({
  invoiceId: z.string().uuid(),
  notes: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
});

/** @requiredArborAdmin true */
export async function markInvoiceVoidAction(
  input: unknown,
): Promise<ActionResult<{ invoiceId: string }>> {
  const parsed = markVoidSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  if (!(await isArborAdmin())) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Arbor admin only." },
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("arbor_invoices")
    .update({ status: "void", notes: parsed.data.notes })
    .eq("id", parsed.data.invoiceId);
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  revalidatePath("/agency/billing");
  revalidatePath(`/agency/billing/${parsed.data.invoiceId}`);
  return { ok: true, data: { invoiceId: parsed.data.invoiceId } };
}
