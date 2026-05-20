"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type AcceptResult =
  | { ok: true; data: { membershipId: string | null } }
  | { ok: false; error: { code: string; message: string } };

// Used by the already-signed-in path on /accept-invite/[token]. Caller is
// signed in with the matching email and just needs the membership row.
export async function acceptInvitationAction(token: string): Promise<AcceptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to accept" } };
  }

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    let msg = error.message;
    if (msg.includes("expired")) msg = "Invitation expired";
    else if (msg.includes("different email")) {
      msg = "This invitation is for a different email";
    } else if (msg.includes("not found")) msg = "Invitation not found";
    return { ok: false, error: { code: error.code, message: msg } };
  }
  return { ok: true, data: { membershipId: data } };
}

// New primary path. Caller is NOT signed in; the invitation link gives them
// the right to set a password for the invited email and step into a session.
// Effectively a pre-authorized password reset bound to the invite token.
//
// Flow: validate token → create-or-update auth user with the chosen password
// → signInWithPassword to set the session cookie → accept the invitation
// (creates the org_memberships row) → redirect to /dashboard.
//
// If the email already has an Arbor account, this RESETS their password.
// Treated as acceptable because possession of the token proves email
// control, which is the same gate as the existing /auth/reset flow.
export async function acceptInvitationWithPassword(
  token: string,
  password: string,
): Promise<{ ok: false; error: { code: string; message: string } }> {
  if (!password || password.length < 8) {
    return {
      ok: false,
      error: { code: "PASSWORD_TOO_SHORT", message: "Password must be at least 8 characters." },
    };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return {
      ok: false,
      error: { code: "ADMIN_CLIENT", message: e instanceof Error ? e.message : String(e) },
    };
  }

  // 1. Look up the invitation via service role (bypasses RLS; the token is
  // the only auth gate).
  const { data: invites, error: lookupErr } = await admin
    .from("org_invitations")
    .select("id, org_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .limit(1);
  if (lookupErr) {
    return { ok: false, error: { code: lookupErr.code, message: lookupErr.message } };
  }
  const invite = invites[0];
  if (!invite) {
    return {
      ok: false,
      error: { code: "INVITE_NOT_FOUND", message: "Invitation not found." },
    };
  }
  if (invite.accepted_at) {
    return {
      ok: false,
      error: { code: "INVITE_ACCEPTED", message: "This invitation has already been accepted." },
    };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return {
      ok: false,
      error: { code: "INVITE_EXPIRED", message: "Invitation expired." },
    };
  }

  const email = invite.email.toLowerCase();

  // 2. Resolve auth user — create if new, set password if existing. Cuts
  // the round-trip count vs. always trying createUser and parsing the dup
  // error code: the dedicated RPC tells us deterministically.
  const { data: existingUserId, error: lookupUserErr } = await admin.rpc("auth_user_id_by_email", {
    p_email: email,
  });
  if (lookupUserErr) {
    return { ok: false, error: { code: lookupUserErr.code, message: lookupUserErr.message } };
  }

  if (existingUserId) {
    const { error: updErr } = await admin.auth.admin.updateUserById(existingUserId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      return { ok: false, error: { code: "UPDATE_PASSWORD_FAILED", message: updErr.message } };
    }
  } else {
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      return { ok: false, error: { code: "CREATE_USER_FAILED", message: createErr.message } };
    }
  }

  // 3. Sign in via the cookie-bound client so the session cookie is set on
  // this response. accept_invitation reads auth.uid() and needs the session.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return { ok: false, error: { code: "SIGN_IN_FAILED", message: signInErr.message } };
  }

  // 4. Accept — creates org_memberships, marks invitation accepted. Uses
  // the just-established session for auth.uid(); errors here would mean
  // the invite became invalid between steps 1 and 4, vanishingly rare.
  const { error: acceptErr } = await supabase.rpc("accept_invitation", { p_token: token });
  if (acceptErr) {
    return { ok: false, error: { code: acceptErr.code, message: acceptErr.message } };
  }

  redirect("/dashboard");
}
