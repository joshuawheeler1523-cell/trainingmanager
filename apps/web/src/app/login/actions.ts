"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Public SSO discovery: looks up an email's domain in sso_configs (via the
 * SECURITY DEFINER lookup_sso_for_email_domain RPC) and returns the
 * Supabase provider id if SSO is enabled. Called from /login client to
 * decide whether to dispatch to SSO or fall through to magic-link/password.
 */
export async function discoverSsoForEmail(
  email: string,
): Promise<{ providerId: string; displayName: string | null } | null> {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim();
  if (!domain) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("lookup_sso_for_email_domain", { p_domain: domain });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.provider_id) return null;
  return { providerId: row.provider_id, displayName: row.display_name };
}

/**
 * Initiates SAML sign-in for a known provider id. Supabase returns a URL
 * to redirect the browser to the IdP; we 302 there. After successful
 * auth at the IdP, the user lands at /auth/callback.
 */
export async function startSsoSignIn(providerId: string): Promise<void> {
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithSSO({
    providerId,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) {
    redirect(`/login?sso_error=${encodeURIComponent(error?.message ?? "sso_failed")}`);
  }
  redirect(data.url);
}

export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function sendMagicLink(
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = (formData.get("email") as string | null)?.trim();
  if (!email) return { status: "error", message: "Email is required." };

  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { status: "error", message: error.message };
  return { status: "sent", email };
}

export type PasswordState = { error?: string };

export async function signInWithPassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/");
}
