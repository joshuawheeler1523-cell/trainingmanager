"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireArborAdmin } from "@/lib/auth/arbor-admin";
import { sendEmail } from "@/lib/email";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

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
}): Promise<ActionResult<{ emailSent: boolean }>> {
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
  return { ok: true, data: { emailSent } };
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
