"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Name required").max(120),
});

/**
 * Updates the signed-in user's profile (currently just full_name in
 * user_metadata). Email changes go through Supabase's separate
 * email-change flow which sends a confirmation link.
 */
export async function updateProfileAction(input: unknown): Promise<ActionResult<true>> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: { code: "VALIDATION", message: first?.message ?? "Invalid input" },
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.fullName },
  });
  if (error) return { ok: false, error: { code: "UPDATE_FAILED", message: error.message } };
  revalidatePath("/account");
  return { ok: true, data: true };
}

const updateEmailSchema = z.object({ email: z.string().email() });

/**
 * Initiates an email change. Supabase sends a confirmation link to the
 * NEW address; the change only takes effect once the user clicks it.
 */
export async function updateEmailAction(input: unknown): Promise<ActionResult<true>> {
  const parsed = updateEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Valid email required" } };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
  if (error) return { ok: false, error: { code: "UPDATE_FAILED", message: error.message } };
  return { ok: true, data: true };
}

/**
 * Signs the user out of every active session across all devices. Useful
 * if their device was lost or they suspect their credentials leaked.
 */
export async function signOutEverywhereAction(): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: { code: "SIGNOUT_FAILED", message: error.message } };
  redirect("/login");
}

const deleteAccountSchema = z.object({
  confirmEmail: z.string().email("Type your email to confirm"),
});

/**
 * Permanently deletes the calling user's account. GDPR Article 17 +
 * CCPA right-to-delete.
 *
 * Behavior:
 *   - All audit_log rows where actor_id = userId have actor_id set to
 *     NULL (record retained for compliance audit; identity scrubbed).
 *   - auth.users row deleted via admin client. ON DELETE SET NULL
 *     cascades scrub created_by/updated_by on every tenant table.
 *   - org_memberships + agency_memberships ON DELETE CASCADE removes
 *     them from every org/agency they were in.
 *   - Customer Data uploaded by the user (instructors, classes, etc.)
 *     stays in the org. The user's identity is no longer associated
 *     with the records, but the records themselves belong to the org
 *     (which is the data controller).
 *
 * This is irreversible. The UI requires the user to type their email
 * to confirm.
 */
export async function deleteAccountAction(input: unknown): Promise<ActionResult<true>> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Type your email to confirm", field: "confirmEmail" },
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in required" } };
  }
  if (parsed.data.confirmEmail.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return {
      ok: false,
      error: {
        code: "EMAIL_MISMATCH",
        message: "Email doesn't match your account",
        field: "confirmEmail",
      },
    };
  }

  const admin = createAdminClient();

  // Anonymize audit log entries — keep the records (org needs them for
  // SOC 2 / forensic) but strip the user's identity from them.
  await admin.from("audit_log").update({ actor_id: null }).eq("actor_id", user.id);

  // Delete the auth user. ON DELETE cascades clean up the rest:
  //   - org_memberships, agency_memberships → CASCADE (member rows deleted)
  //   - created_by / updated_by FKs across tenant tables → SET NULL
  //   - org_invitations created_by → SET NULL
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    return { ok: false, error: { code: "DELETE_FAILED", message: deleteErr.message } };
  }

  // Sign out the (now-defunct) browser session
  await supabase.auth.signOut();
  redirect("/?account_deleted=1");
}
