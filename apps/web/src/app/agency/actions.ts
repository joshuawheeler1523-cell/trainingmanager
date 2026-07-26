"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@arbor/shared";
import { PRESETS, TOGGLEABLE_MODULES, type PresetKey } from "@arbor/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAgencyId, isAgencyAdmin } from "@/lib/auth/agency";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import { toSlug } from "@/lib/utils/slug";
import { inviteEmailHtml, inviteEmailText, sendEmail } from "@/lib/email";
import { brandFromHeader, getBrandForOrg } from "@/lib/brand";
import type { Json } from "@/lib/supabase/database.types";

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

const PRESET_KEY_VALUES: [PresetKey, ...PresetKey[]] = [
  "hospital_training",
  "corporate_ld",
  "emr_analyst",
  "clinical_informatics",
  "software_engineering",
  "consulting",
  "creative_agency",
  "custom",
];

const createClientOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(200),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only")
    .optional(),
  presetKey: z.enum(PRESET_KEY_VALUES).default("hospital_training"),
});

/**
 * Provisions a new client org under the caller's agency.
 *
 * Flow:
 *   1. Validate input + verify caller is agency_admin
 *   2. Use admin client (service role) to bypass org-level RLS for the
 *      cross-cutting setup work (insert org, default department, manager
 *      membership, feature flags)
 *   3. Insert organizations row with agency_id set + preset_key
 *   4. Create the default "General" department (matches the existing
 *      auto-creation pattern in 20260508120000_add_departments.sql)
 *   5. Add the agency_admin as manager of the new org so they can
 *      configure it. They can later remove themselves once the hospital's
 *      manager is invited and accepts.
 *   6. Seed module feature_flags from the preset's manifest
 *   7. Write an audit_log entry with the new org_id
 *
 * @requiredAgencyRole agency_admin
 */
export async function createClientOrgAction(
  input: unknown,
): Promise<ActionResult<{ orgId: string; slug: string }>> {
  const parsed = createClientOrgSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency", "createClientOrg", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  // Resolve the calling user (we'll add them as a manager of the new org).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in required" } };
  }

  const slug = parsed.data.slug ?? toSlug(parsed.data.name);
  const preset = PRESETS[parsed.data.presetKey];
  const admin = createAdminClient();

  // 1. Insert the org with agency_id set + preset.
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: parsed.data.name,
      slug,
      agency_id: agencyId,
      preset_key: parsed.data.presetKey,
      role_labels: preset.roleLabels as unknown as Json,
      entity_labels: preset.entityLabels as unknown as Json,
    })
    .select("id, slug")
    .single();
  if (orgErr) {
    return {
      ok: false,
      error: { code: orgErr.code, message: orgErr.message },
    };
  }

  // 2. Create the default "General" department for the new org.
  const { error: deptErr } = await admin.from("departments").insert({
    org_id: org.id,
    name: "General",
    slug: "general",
    description: "Default department for the organization.",
  });
  if (deptErr) {
    // Best-effort cleanup
    await admin.from("organizations").delete().eq("id", org.id);
    return {
      ok: false,
      error: { code: deptErr.code, message: deptErr.message },
    };
  }

  // 3. (Intentionally no org_membership for the agency admin.) Agency admins
  // get manager-equivalent access to every org under their agency via the
  // is_agency_admin_of_org() helper baked into the role functions — so they
  // operate inside client orgs WITHOUT counting as a hospital member/seat.

  // 4. Seed module feature flags from the preset.
  const moduleRows = TOGGLEABLE_MODULES.map((key) => ({
    org_id: org.id,
    key,
    enabled: preset.modules[key],
  }));
  await admin.from("feature_flags").insert(moduleRows);

  // 5. Audit log entry — the org is the relevant context.
  await admin.from("audit_log").insert({
    org_id: org.id,
    actor_id: user.id,
    operation: "AGENCY_PROVISIONED_CLIENT_ORG",
    table_name: "organizations",
    record_id: org.id,
    changed_fields: null,
    old_values: null,
    new_values: {
      agency_id: agencyId,
      preset_key: parsed.data.presetKey,
      slug: org.slug,
    },
  });

  revalidatePath("/agency");
  return { ok: true, data: { orgId: org.id, slug: org.slug } };
}

// ── invite a user to a client org (agency_admin only) ──────────────────────
//
// Lets the agency_admin send an invite email to the org's first manager
// without bouncing through that org's workspace. Mirrors /admin/inviteUser
// but checks agency ownership instead of org membership.

const inviteOrgMemberSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email("Must be a valid email"),
  role: z.enum(["manager", "instructor", "viewer"]).default("manager"),
});

async function appOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${proto}://${host}`;
}

/** @requiredAgencyRole agency_admin */
export async function agencyInviteOrgMemberAction(
  input: unknown,
): Promise<ActionResult<{ acceptUrl: string; emailDelivered: boolean }>> {
  const parsed = inviteOrgMemberSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency", "agencyInviteOrgMember", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();
  // Verify the org belongs to this agency.
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, agency_id")
    .eq("id", parsed.data.orgId)
    .maybeSingle();
  if (!org || org.agency_id !== agencyId) {
    return { ok: false, error: { code: "NOT_YOUR_ORG", message: "Org is not under your agency" } };
  }

  // Insert the invitation row (trigger generates the token).
  const { data: invite, error } = await admin
    .from("org_invitations")
    .insert({
      org_id: org.id,
      email: parsed.data.email,
      role: parsed.data.role,
      visibility: "full",
    })
    .select("id, token, email")
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  const origin = await appOrigin();
  const acceptUrl = `${origin}/accept-invite/${invite.token}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const inviterName = (user?.user_metadata.full_name as string | undefined) ?? user?.email ?? null;
  const brand = await getBrandForOrg(org.id);

  const sendResult = await sendEmail({
    to: invite.email,
    subject: `${inviterName ?? "An admin"} invited you to ${org.name}`,
    html: inviteEmailHtml({
      orgName: org.name,
      inviterName,
      acceptUrl,
      brand: { primaryColor: brand.primaryColor, logoUrl: brand.logoUrl },
    }),
    text: inviteEmailText({ orgName: org.name, inviterName, acceptUrl }),
    ...(brand.source === "agency" ? { from: brandFromHeader(brand) } : {}),
  });

  revalidatePath("/agency");
  return {
    ok: true,
    data: {
      acceptUrl,
      emailDelivered: sendResult.ok && !("degraded" in sendResult ? sendResult.degraded : false),
    },
  };
}
