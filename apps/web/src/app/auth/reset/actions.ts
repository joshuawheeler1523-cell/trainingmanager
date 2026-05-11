"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ResetRequestState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/**
 * Sends a password-reset email via Supabase Auth. The recipient gets a
 * link back to /auth/reset/confirm with a recovery token in the URL.
 *
 * Always returns "sent" for syntactically valid emails, even if the
 * email isn't registered — prevents email enumeration. The actual
 * Supabase API silently no-ops on unknown emails for the same reason.
 */
export async function sendPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = (formData.get("email") as string | null)?.trim();
  if (!email) return { status: "error", message: "Email is required." };

  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset/confirm`,
  });
  if (error) {
    // Most errors are also no-ops on the user-facing side. Log on the
    // server but show the generic "sent" state.
    console.warn("[auth/reset] resetPasswordForEmail error:", error.message);
  }
  return { status: "sent", email };
}

export type SetPasswordState = { error?: string; ok?: true };

/**
 * Sets a new password for the currently-authenticated session. Called
 * from the confirm page after the user clicks the recovery link — at
 * which point they're temporarily signed in via the recovery token.
 */
export async function setNewPassword(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = (formData.get("password") as string | null) ?? "";
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true };
}
