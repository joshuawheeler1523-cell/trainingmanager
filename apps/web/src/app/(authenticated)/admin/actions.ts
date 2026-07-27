"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import { inviteEmailHtml, inviteEmailText, sendEmail } from "@/lib/email";
import { brandFromHeader, getBrandForOrg } from "@/lib/brand";
import type { TablesUpdate } from "@/lib/supabase/database.types";
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
 * Resolves the current org and verifies the caller holds the manager role.
 * On FORBIDDEN, writes a DENIED entry to audit_log so unauthorized attempts
 * are queryable. On NO_ORG (no active org cookie), returns without logging
 * since there's no org to attribute the denial to.
 */
async function ctx(action: string) {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "admin", action, "not_manager");
    return { ok: false as const, error: { code: "FORBIDDEN", message: "Manager only" } };
  }
  return { ok: true as const, supabase, orgId };
}

function revalidateAdmin() {
  revalidatePath("/admin/team");
  revalidatePath("/admin/invitations");
  revalidatePath("/admin/settings");
}

async function appOrigin(): Promise<string> {
  // Compute origin from x-forwarded-host so invite URLs work behind Vercel.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${proto}://${host}`;
}

// ── invitations ────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email("Must be a valid email"),
  role: z.enum(["manager", "instructor", "viewer"]).default("instructor"),
  visibility: z.enum(["full", "limited"]).default("full"),
});

/** @requiredRole manager */
export async function inviteUser(
  input: unknown,
): Promise<ActionResult<{ id: string; acceptUrl: string; emailDelivered: boolean }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx("inviteUser");
  if (!c.ok) return c;

  // Insert the invitation row first; the trigger generates the token.
  const { data: invite, error } = await c.supabase
    .from("org_invitations")
    .insert({
      org_id: c.orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      visibility: parsed.data.visibility,
    })
    .select("id, token, email")
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  // Compose + send email (degrades to console-log if RESEND_API_KEY is unset).
  const origin = await appOrigin();
  const acceptUrl = `${origin}/accept-invite/${invite.token}`;

  const [{ data: org }, { data: userData }, brand] = await Promise.all([
    c.supabase.from("organizations").select("name").eq("id", c.orgId).maybeSingle(),
    c.supabase.auth.getUser(),
    getBrandForOrg(c.orgId),
  ]);
  const user = userData.user;
  const orgName = org?.name ?? "Your organization";
  const inviterName = (user?.user_metadata.full_name as string | undefined) ?? user?.email ?? null;

  const sendResult = await sendEmail({
    to: invite.email,
    subject: `${inviterName ?? "An admin"} invited you to ${orgName}`,
    html: inviteEmailHtml({
      orgName,
      inviterName,
      acceptUrl,
      brand: { primaryColor: brand.primaryColor, logoUrl: brand.logoUrl },
    }),
    text: inviteEmailText({ orgName, inviterName, acceptUrl }),
    ...(brand.source === "agency" ? { from: brandFromHeader(brand) } : {}),
  });

  revalidateAdmin();
  return {
    ok: true,
    data: {
      id: invite.id,
      acceptUrl,
      emailDelivered: sendResult.ok && !("degraded" in sendResult ? sendResult.degraded : false),
    },
  };
}

/** @requiredRole manager */
export async function resendInvitation(
  invitationId: string,
): Promise<ActionResult<{ acceptUrl: string; emailDelivered: boolean }>> {
  const c = await ctx("resendInvitation");
  if (!c.ok) return c;

  // Bump expires_at so the link is valid for another 7 days.
  const { data: invite, error } = await c.supabase
    .from("org_invitations")
    .update({ expires_at: new Date(Date.now() + 7 * 86400000).toISOString() })
    .eq("id", invitationId)
    .eq("org_id", c.orgId)
    .is("accepted_at", null)
    .select("id, token, email")
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  const origin = await appOrigin();
  const acceptUrl = `${origin}/accept-invite/${invite.token}`;
  const [{ data: org }, { data: userData }, brand] = await Promise.all([
    c.supabase.from("organizations").select("name").eq("id", c.orgId).maybeSingle(),
    c.supabase.auth.getUser(),
    getBrandForOrg(c.orgId),
  ]);
  const user = userData.user;
  const orgName = org?.name ?? "Your organization";
  const inviterName = (user?.user_metadata.full_name as string | undefined) ?? user?.email ?? null;

  const sendResult = await sendEmail({
    to: invite.email,
    subject: `Reminder: ${orgName} invitation`,
    html: inviteEmailHtml({
      orgName,
      inviterName,
      acceptUrl,
      brand: { primaryColor: brand.primaryColor, logoUrl: brand.logoUrl },
    }),
    text: inviteEmailText({ orgName, inviterName, acceptUrl }),
    ...(brand.source === "agency" ? { from: brandFromHeader(brand) } : {}),
  });

  revalidateAdmin();
  return {
    ok: true,
    data: {
      acceptUrl,
      emailDelivered: sendResult.ok && !("degraded" in sendResult ? sendResult.degraded : false),
    },
  };
}

/** @requiredRole manager */
export async function revokeInvitation(
  invitationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx("revokeInvitation");
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("org_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("org_id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateAdmin();
  return { ok: true, data: { id: invitationId } };
}

// ── team management ────────────────────────────────────────────────────────

const memberPatchSchema = z.object({
  role: z.enum(["manager", "instructor", "viewer"]).optional(),
  visibility: z.enum(["full", "limited"]).optional(),
  display_name: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .optional(),
});

/** @requiredRole manager */
export async function updateMember(
  membershipId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = memberPatchSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx("updateMember");
  if (!c.ok) return c;

  // Last-manager guard: if demoting a manager, ensure another manager exists.
  if (parsed.data.role && parsed.data.role !== "manager") {
    const { count: managerCount } = await c.supabase
      .from("org_memberships")
      .select("*", { count: "exact", head: true })
      .eq("org_id", c.orgId)
      .eq("role", "manager")
      .not("accepted_at", "is", null);
    const { data: target } = await c.supabase
      .from("org_memberships")
      .select("role")
      .eq("id", membershipId)
      .eq("org_id", c.orgId)
      .maybeSingle();
    if (target?.role === "manager" && (managerCount ?? 0) <= 1) {
      return {
        ok: false,
        error: { code: "LAST_MANAGER", message: "Cannot demote the last manager" },
      };
    }
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) patch["role"] = parsed.data.role;
  if (parsed.data.visibility !== undefined) patch["visibility"] = parsed.data.visibility;
  if (parsed.data.display_name !== undefined) patch["display_name"] = parsed.data.display_name;

  if (Object.keys(patch).length === 0) {
    return { ok: true, data: { id: membershipId } };
  }

  const { error } = await c.supabase
    .from("org_memberships")
    .update(patch as unknown as TablesUpdate<"org_memberships">)
    .eq("id", membershipId)
    .eq("org_id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidateAdmin();
  return { ok: true, data: { id: membershipId } };
}

/** @requiredRole manager */
export async function removeMember(membershipId: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx("removeMember");
  if (!c.ok) return c;

  // Block removing the last manager.
  const { data: target } = await c.supabase
    .from("org_memberships")
    .select("role, user_id")
    .eq("id", membershipId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  if (target?.role === "manager") {
    const { count: managerCount } = await c.supabase
      .from("org_memberships")
      .select("*", { count: "exact", head: true })
      .eq("org_id", c.orgId)
      .eq("role", "manager")
      .not("accepted_at", "is", null);
    if ((managerCount ?? 0) <= 1) {
      return {
        ok: false,
        error: { code: "LAST_MANAGER", message: "Cannot remove the last manager" },
      };
    }
  }

  const { error } = await c.supabase
    .from("org_memberships")
    .delete()
    .eq("id", membershipId)
    .eq("org_id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateAdmin();
  return { ok: true, data: { id: membershipId } };
}

// ── org settings ───────────────────────────────────────────────────────────

const settingsSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).optional(),
  time_zone: z.string().min(1).max(64).optional(),
  logo_url: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .optional(),
  // Stored in organizations.settings jsonb.
  brand_color: z
    .string()
    .regex(/^#([0-9a-f]{6})$/i, "Hex color like #2563eb")
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v))
    .optional(),
  default_working_hours_per_week: z.coerce.number().min(1).max(80).optional(),
  cert_expiry_warning_days: z.coerce.number().int().min(1).max(365).optional(),
  request_aging_days: z.coerce.number().int().min(1).max(60).optional(),
});

/** @requiredRole manager */
export async function updateOrgSettings(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx("updateOrgSettings");
  if (!c.ok) return c;

  // Read current settings jsonb so we can merge.
  const { data: current } = await c.supabase
    .from("organizations")
    .select("settings")
    .eq("id", c.orgId)
    .maybeSingle();
  const currentSettings = (current?.settings ?? {}) as Record<string, unknown>;

  const settingsPatch: Record<string, unknown> = {};
  if (parsed.data.brand_color !== undefined) settingsPatch["brand_color"] = parsed.data.brand_color;
  if (parsed.data.default_working_hours_per_week !== undefined) {
    settingsPatch["default_working_hours_per_week"] = parsed.data.default_working_hours_per_week;
  }
  if (parsed.data.cert_expiry_warning_days !== undefined) {
    settingsPatch["cert_expiry_warning_days"] = parsed.data.cert_expiry_warning_days;
  }
  if (parsed.data.request_aging_days !== undefined) {
    settingsPatch["request_aging_days"] = parsed.data.request_aging_days;
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update["name"] = parsed.data.name;
  if (parsed.data.time_zone !== undefined) update["time_zone"] = parsed.data.time_zone;
  if (parsed.data.logo_url !== undefined) update["logo_url"] = parsed.data.logo_url;
  if (Object.keys(settingsPatch).length > 0) {
    update["settings"] = { ...currentSettings, ...settingsPatch };
  }

  if (Object.keys(update).length === 0) {
    return { ok: true, data: { id: c.orgId } };
  }

  const { error } = await c.supabase
    .from("organizations")
    .update(update as unknown as TablesUpdate<"organizations">)
    .eq("id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidateAdmin();
  return { ok: true, data: { id: c.orgId } };
}

// ── feature flags ──────────────────────────────────────────────────────────

const flagSchema = z.object({
  key: z.string().min(1).max(64),
  enabled: z.coerce.boolean(),
});

/** @requiredRole manager */
export async function setFeatureFlag(
  input: unknown,
): Promise<ActionResult<{ key: string; enabled: boolean }>> {
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx("setFeatureFlag");
  if (!c.ok) return c;

  const { error } = await c.supabase.from("feature_flags").upsert(
    {
      org_id: c.orgId,
      key: parsed.data.key,
      enabled: parsed.data.enabled,
    },
    { onConflict: "org_id,key" },
  );
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidateAdmin();
  return { ok: true, data: parsed.data };
}
