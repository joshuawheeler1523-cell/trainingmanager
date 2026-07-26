"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireArborAdmin } from "@/lib/auth/arbor-admin";
import { sendEmail } from "@/lib/email";
import type { ActionResult } from "@arbor/shared";

/**
 * Sends a password-reset email to the user. Same Supabase flow as the
 * /auth/reset request page; here we trigger it administratively for a
 * user who's locked out / forgot their password.
 */
export async function sendPasswordResetForUserAction(args: {
  userId: string;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { data: userResp, error: lookupErr } = await admin.auth.admin.getUserById(args.userId);
  if (lookupErr || !userResp.user.email) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found or no email" } };
  }
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const { error } = await admin.auth.resetPasswordForEmail(userResp.user.email, {
    redirectTo: `${origin}/auth/reset/confirm`,
  });
  if (error) return { ok: false, error: { code: "RESET_FAILED", message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_PASSWORD_RESET_SENT", null);
  return { ok: true, data: true };
}

/**
 * Sends a fresh magic-link sign-in to the user. Useful when the
 * original signup email got lost or the previous link expired.
 */
export async function sendMagicLinkForUserAction(args: {
  userId: string;
}): Promise<ActionResult<{ emailSent: boolean; signInLink: string }>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { data: userResp, error: lookupErr } = await admin.auth.admin.getUserById(args.userId);
  if (lookupErr || !userResp.user.email) {
    return { ok: false, error: { code: "USER_NOT_FOUND", message: "User not found or no email" } };
  }
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userResp.user.email,
    options: { redirectTo: `${origin}/dashboard` },
  });
  if (linkErr || !linkData.properties.action_link) {
    return {
      ok: false,
      error: { code: "LINK_FAILED", message: linkErr?.message ?? "Could not generate link" },
    };
  }
  const result = await sendEmail({
    to: userResp.user.email,
    subject: "Your Arbor sign-in link",
    html: `<p>Click to sign in to Arbor:</p><p><a href="${linkData.properties.action_link}">${linkData.properties.action_link}</a></p>`,
    text: `Sign in to Arbor: ${linkData.properties.action_link}`,
  });
  const emailSent = result.ok && !("degraded" in result ? result.degraded : false);

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_MAGIC_LINK_SENT", {
    email_sent: emailSent,
  });
  // Return the link itself so the admin can copy/paste it when email is
  // unconfigured (degraded mode) — otherwise the only delivery path is the
  // email that never sends. One-time link; expires per Supabase defaults.
  return { ok: true, data: { emailSent, signInLink: linkData.properties.action_link } };
}

/**
 * Force-signs-out the user across every device. The next request from
 * any of their existing sessions will need to re-authenticate.
 */
export async function forceSignOutUserAction(args: {
  userId: string;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  // signOut takes a JWT or a global flag — we use the admin sessions
  // delete RPC to wipe every refresh token for this user.
  const { error } = await admin.auth.admin.signOut(args.userId, "global");
  if (error) return { ok: false, error: { code: "SIGNOUT_FAILED", message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_FORCE_SIGNED_OUT", null);
  return { ok: true, data: true };
}

/**
 * Bans a user from signing in for ~100 years (effectively permanent
 * until unbanned). Supabase's ban_duration is the supported mechanism.
 */
export async function suspendUserAction(args: { userId: string }): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  // banned_until is a future timestamp; using "876000h" = 100 years.
  const { error } = await admin.auth.admin.updateUserById(args.userId, {
    ban_duration: "876000h",
  });
  if (error) return { ok: false, error: { code: "SUSPEND_FAILED", message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_SUSPENDED", null);
  revalidatePath(`/arbor/users/${args.userId}`);
  return { ok: true, data: true };
}

export async function unsuspendUserAction(args: { userId: string }): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(args.userId, { ban_duration: "none" });
  if (error) return { ok: false, error: { code: "UNSUSPEND_FAILED", message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_UNSUSPENDED", null);
  revalidatePath(`/arbor/users/${args.userId}`);
  return { ok: true, data: true };
}

export async function deleteUserAction(args: { userId: string }): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  // Anonymize audit_log + delete (same pattern as the user-self-delete flow)
  await admin.from("audit_log").update({ actor_id: null }).eq("actor_id", args.userId);
  const { error } = await admin.auth.admin.deleteUser(args.userId);
  if (error) return { ok: false, error: { code: "DELETE_FAILED", message: error.message } };

  // Audit AFTER delete (no actor_id needed — we're tracking the
  // deletion itself; the org_id below is a placeholder since we don't
  // have a clean tenant context for "user deleted" events).
  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_DELETED", null);
  revalidatePath("/arbor/users");
  return { ok: true, data: true };
}

// ── Membership management ──────────────────────────────────────────────────
//
// Per-org and per-agency role management. Arbor admins can promote/demote
// a user in any org or agency, add them to a new org/agency, or remove them
// outright. All actions are audit-logged so we have provenance for support.

const ORG_ROLES = ["manager", "instructor", "viewer"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

const AGENCY_ROLES = ["agency_admin", "agency_member"] as const;
type AgencyRole = (typeof AGENCY_ROLES)[number];

export async function changeUserOrgRoleAction(args: {
  userId: string;
  orgId: string;
  role: OrgRole;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  if (!ORG_ROLES.includes(args.role)) {
    return { ok: false, error: { code: "BAD_ROLE", message: "Invalid org role" } };
  }
  const admin = createAdminClient();
  const { data: existing, error: lookupErr } = await admin
    .from("org_memberships")
    .select("role")
    .eq("user_id", args.userId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: { code: lookupErr.code, message: lookupErr.message } };
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_A_MEMBER", message: "User is not a member of that org" },
    };
  }
  if (existing.role === args.role) return { ok: true, data: true };

  const { error } = await admin
    .from("org_memberships")
    .update({ role: args.role })
    .eq("user_id", args.userId)
    .eq("org_id", args.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_ORG_ROLE_CHANGED", {
    org_id: args.orgId,
    from: existing.role,
    to: args.role,
  });
  revalidatePath(`/arbor/users/${args.userId}`);
  revalidatePath(`/arbor/orgs/${args.orgId}`);
  return { ok: true, data: true };
}

export async function addUserToOrgAction(args: {
  userId: string;
  orgId: string;
  role: OrgRole;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  if (!ORG_ROLES.includes(args.role)) {
    return { ok: false, error: { code: "BAD_ROLE", message: "Invalid org role" } };
  }
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("org_memberships")
    .select("role")
    .eq("user_id", args.userId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: { code: "ALREADY_MEMBER", message: "User is already a member of that org" },
    };
  }
  const nowIso = new Date().toISOString();
  const { error } = await admin.from("org_memberships").insert({
    user_id: args.userId,
    org_id: args.orgId,
    role: args.role,
    invited_at: nowIso,
    accepted_at: nowIso,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_ADDED_TO_ORG", {
    org_id: args.orgId,
    role: args.role,
  });
  revalidatePath(`/arbor/users/${args.userId}`);
  revalidatePath(`/arbor/orgs/${args.orgId}`);
  return { ok: true, data: true };
}

export async function removeUserFromOrgAction(args: {
  userId: string;
  orgId: string;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("org_memberships")
    .delete()
    .eq("user_id", args.userId)
    .eq("org_id", args.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_REMOVED_FROM_ORG", {
    org_id: args.orgId,
  });
  revalidatePath(`/arbor/users/${args.userId}`);
  revalidatePath(`/arbor/orgs/${args.orgId}`);
  return { ok: true, data: true };
}

export async function changeUserAgencyRoleAction(args: {
  userId: string;
  agencyId: string;
  role: AgencyRole;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  if (!AGENCY_ROLES.includes(args.role)) {
    return { ok: false, error: { code: "BAD_ROLE", message: "Invalid agency role" } };
  }
  const admin = createAdminClient();
  const { data: existing, error: lookupErr } = await admin
    .from("agency_memberships")
    .select("role")
    .eq("user_id", args.userId)
    .eq("agency_id", args.agencyId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: { code: lookupErr.code, message: lookupErr.message } };
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_A_MEMBER", message: "User is not a member of that agency" },
    };
  }
  if (existing.role === args.role) return { ok: true, data: true };

  const { error } = await admin
    .from("agency_memberships")
    .update({ role: args.role })
    .eq("user_id", args.userId)
    .eq("agency_id", args.agencyId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_AGENCY_ROLE_CHANGED", {
    agency_id: args.agencyId,
    from: existing.role,
    to: args.role,
  });
  revalidatePath(`/arbor/users/${args.userId}`);
  revalidatePath(`/arbor/agencies/${args.agencyId}`);
  return { ok: true, data: true };
}

export async function removeUserFromAgencyAction(args: {
  userId: string;
  agencyId: string;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("agency_memberships")
    .delete()
    .eq("user_id", args.userId)
    .eq("agency_id", args.agencyId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborUserAuditLog(admin, args.userId, "ARBOR_ADMIN_USER_REMOVED_FROM_AGENCY", {
    agency_id: args.agencyId,
  });
  revalidatePath(`/arbor/users/${args.userId}`);
  revalidatePath(`/arbor/agencies/${args.agencyId}`);
  return { ok: true, data: true };
}

async function writeArborUserAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  op: string,
  newValues: unknown,
): Promise<void> {
  // audit_log.org_id is NOT NULL. For user-scoped Arbor admin events
  // there's no clean tenant id, so we use the user's id as a surrogate.
  const { data: userData } = await (await createClient()).auth.getUser();
  await admin.from("audit_log").insert({
    org_id: userId,
    actor_id: userData.user?.id ?? null,
    operation: op,
    table_name: "auth.users",
    record_id: userId,
    changed_fields: null,
    old_values: null,
    new_values: newValues as never,
  });
}
