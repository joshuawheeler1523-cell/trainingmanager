"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireArborAdmin } from "@/lib/auth/arbor-admin";
import { sendEmail, inviteEmailHtml, inviteEmailText } from "@/lib/email";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

const createAgencySchema = z.object({
  agencyName: z.string().trim().min(2).max(120),
  agencySlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  adminEmail: z.string().email(),
  adminFullName: z.string().trim().min(1).max(120),
  revenueSharePct: z.number().int().min(0).max(10000).optional(),
  paymentTermsDays: z.number().int().min(1).max(180).optional(),
});

/**
 * Arbor admin creates an agency on behalf of a customer. Same plumbing
 * as /agency-signup but skips the throttle, accepts existing users
 * (since you're hand-onboarding a known customer), and audits as
 * ARBOR_ADMIN_AGENCY_CREATED.
 */
export async function createAgencyAsArborAdminAction(
  input: unknown,
): Promise<ActionResult<{ agencyId: string; emailSent: boolean }>> {
  await requireArborAdmin();
  const parsed = createAgencySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: first?.message ?? "Invalid input",
        ...(first ? { field: first.path.join(".") } : {}),
      },
    };
  }

  const admin = createAdminClient();

  // Slug uniqueness
  const { data: existingAgency } = await admin
    .from("agencies")
    .select("id")
    .eq("slug", parsed.data.agencySlug)
    .maybeSingle();
  if (existingAgency) {
    return { ok: false, error: { code: "SLUG_TAKEN", message: "Slug taken", field: "agencySlug" } };
  }

  // Resolve / create the auth user
  let userId: string;
  const { data: emailLookup } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
    // @ts-expect-error — supabase-js types omit the email filter
    email: parsed.data.adminEmail,
  });
  const existing = emailLookup.users.find(
    (u) => u.email?.toLowerCase() === parsed.data.adminEmail.toLowerCase(),
  );
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: parsed.data.adminEmail,
      email_confirm: false,
      user_metadata: { full_name: parsed.data.adminFullName },
    });
    if (createErr) {
      return { ok: false, error: { code: "USER_CREATE_FAILED", message: createErr.message } };
    }
    userId = created.user.id;
  }

  // Create the agency
  const { data: agencyRow, error: agencyErr } = await admin
    .from("agencies")
    .insert({
      slug: parsed.data.agencySlug,
      name: parsed.data.agencyName,
      created_by: userId,
      ...(parsed.data.revenueSharePct !== undefined
        ? { default_revenue_share_pct: parsed.data.revenueSharePct }
        : {}),
      ...(parsed.data.paymentTermsDays !== undefined
        ? { payment_terms_days: parsed.data.paymentTermsDays }
        : {}),
    })
    .select("id")
    .single();
  if (agencyErr) {
    return { ok: false, error: { code: agencyErr.code, message: agencyErr.message } };
  }

  // Link as agency_admin
  const { error: memErr } = await admin.from("agency_memberships").insert({
    agency_id: agencyRow.id,
    user_id: userId,
    role: "agency_admin",
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
  });
  if (memErr) {
    await admin.from("agencies").delete().eq("id", agencyRow.id);
    return { ok: false, error: { code: memErr.code, message: memErr.message } };
  }

  // Send welcome email with magic link
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: parsed.data.adminEmail,
    options: { redirectTo: `${origin}/agency` },
  });

  let emailSent = false;
  if (!linkErr && linkData.properties.action_link) {
    const result = await sendEmail({
      to: parsed.data.adminEmail,
      subject: `Welcome to Arbor — your agency ${parsed.data.agencyName} is ready`,
      html: inviteEmailHtml({
        orgName: parsed.data.agencyName,
        inviterName: "The Arbor team",
        acceptUrl: linkData.properties.action_link,
      }),
      text: inviteEmailText({
        orgName: parsed.data.agencyName,
        inviterName: "The Arbor team",
        acceptUrl: linkData.properties.action_link,
      }),
    });
    emailSent = result.ok && !("degraded" in result ? result.degraded : false);
  }

  // Audit. Note: audit_log.org_id is NOT NULL — convention is to
  // attribute Arbor-admin agency events to a placeholder. Skip if no
  // orgs exist yet under this agency (new one always has zero).
  await admin.from("audit_log").insert({
    org_id: agencyRow.id, // using agency_id as org_id surrogate; not ideal but the table NOT-NULL constrains us
    actor_id: (await (await createClient()).auth.getUser()).data.user?.id ?? null,
    operation: "ARBOR_ADMIN_AGENCY_CREATED",
    table_name: "agencies",
    record_id: agencyRow.id,
    changed_fields: null,
    old_values: null,
    new_values: {
      slug: parsed.data.agencySlug,
      name: parsed.data.agencyName,
      admin_email: parsed.data.adminEmail,
      via: "arbor_admin",
    } as Json,
  });

  revalidatePath("/arbor/agencies");
  revalidatePath("/arbor");
  return { ok: true, data: { agencyId: agencyRow.id, emailSent } };
}

const updateAgencySchema = z.object({
  agencyId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  revenueSharePct: z.number().int().min(0).max(10000).optional(),
  paymentTermsDays: z.number().int().min(1).max(180).optional(),
});

export async function updateAgencyAsArborAdminAction(input: unknown): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const parsed = updateAgencySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  }
  const admin = createAdminClient();
  const patch: TablesUpdate<"agencies"> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.revenueSharePct !== undefined)
    patch.default_revenue_share_pct = parsed.data.revenueSharePct;
  if (parsed.data.paymentTermsDays !== undefined)
    patch.payment_terms_days = parsed.data.paymentTermsDays;

  const { error } = await admin.from("agencies").update(patch).eq("id", parsed.data.agencyId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, {
    op: "ARBOR_ADMIN_AGENCY_UPDATED",
    recordId: parsed.data.agencyId,
    newValues: patch,
  });

  revalidatePath(`/arbor/agencies/${parsed.data.agencyId}`);
  return { ok: true, data: true };
}

export async function suspendAgencyAction(args: {
  agencyId: string;
  reason: string;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("agencies")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: args.reason })
    .eq("id", args.agencyId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, {
    op: "ARBOR_ADMIN_AGENCY_SUSPENDED",
    recordId: args.agencyId,
    newValues: { reason: args.reason },
  });

  revalidatePath(`/arbor/agencies/${args.agencyId}`);
  revalidatePath("/arbor/agencies");
  return { ok: true, data: true };
}

export async function unsuspendAgencyAction(args: {
  agencyId: string;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("agencies")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("id", args.agencyId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, {
    op: "ARBOR_ADMIN_AGENCY_UNSUSPENDED",
    recordId: args.agencyId,
    newValues: null,
  });

  revalidatePath(`/arbor/agencies/${args.agencyId}`);
  revalidatePath("/arbor/agencies");
  return { ok: true, data: true };
}

export async function deleteAgencyAction(args: { agencyId: string }): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  // Capture for audit before delete cascades
  const { data: agency } = await admin
    .from("agencies")
    .select("name, slug")
    .eq("id", args.agencyId)
    .maybeSingle();

  const { error } = await admin.from("agencies").delete().eq("id", args.agencyId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, {
    op: "ARBOR_ADMIN_AGENCY_DELETED",
    recordId: args.agencyId,
    newValues: agency,
  });

  revalidatePath("/arbor/agencies");
  redirect("/arbor/agencies");
}

async function writeArborAdminAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  args: { op: string; recordId: string; newValues: unknown },
): Promise<void> {
  // audit_log.org_id is NOT NULL — use agency id as the org-id surrogate
  // for Arbor-admin agency-scoped events. Better long-term: relax the
  // NOT NULL constraint or introduce a parallel arbor_admin_log table.
  const { data: userData } = await (await createClient()).auth.getUser();
  await admin.from("audit_log").insert({
    org_id: args.recordId,
    actor_id: userData.user?.id ?? null,
    operation: args.op,
    table_name: "agencies",
    record_id: args.recordId,
    changed_fields: null,
    old_values: null,
    new_values: args.newValues as Json,
  });
}
