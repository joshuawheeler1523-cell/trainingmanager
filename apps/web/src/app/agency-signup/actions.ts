"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, inviteEmailHtml, inviteEmailText } from "@/lib/email";

// Throttle limits — chosen to allow legitimate retries (typo, mistyped
// password, magic-link expired) but block mass-mailer abuse since the
// action emits a "Welcome to Arbor — finish setting up <attacker name>"
// magic-link to any address.
const MAX_ATTEMPTS_PER_IP_PER_HOUR = 3;
const MAX_ATTEMPTS_PER_EMAIL_PER_DAY = 3;

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

const signupSchema = z.object({
  agencyName: z.string().trim().min(2, "Agency name required").max(120),
  agencySlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug too short")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  adminEmail: z.string().email("Valid email required"),
  adminFullName: z.string().trim().min(1, "Your name required").max(120),
});

/**
 * Self-serve agency signup (Phase 9).
 *
 * Creates the agency + a passwordless auth user + an agency_admin
 * membership in one transaction (logically — there's no real DB
 * transaction across auth schema, but failures partial-roll-back via
 * cleanup), then emails a magic-link sign-in to the admin.
 *
 * Public action — no auth required to call. Idempotent on
 * (agency_slug) + (admin_email): rejects if either is taken.
 */
export async function createAgencySignupAction(
  input: unknown,
): Promise<ActionResult<{ agencyId: string; emailSent: boolean }>> {
  const parsed = signupSchema.safeParse(input);
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

  // Best-effort IP capture from forwarded headers (Vercel sets these).
  // We do NOT trust them for auth, only for rate limiting; spoofing them
  // just changes which "bucket" a request gets counted in.
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;

  // Throttle check — counts attempts in the lookback windows.
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  if (ip) {
    const { count: ipCount } = await admin
      .from("agency_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", oneHourAgo);
    if ((ipCount ?? 0) >= MAX_ATTEMPTS_PER_IP_PER_HOUR) {
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many signup attempts from this IP. Try again in an hour.",
        },
      };
    }
  }
  const { count: emailCount } = await admin
    .from("agency_signup_attempts")
    .select("id", { count: "exact", head: true })
    .ilike("email", parsed.data.adminEmail)
    .gte("created_at", oneDayAgo);
  if ((emailCount ?? 0) >= MAX_ATTEMPTS_PER_EMAIL_PER_DAY) {
    return {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many signup attempts for this email. Try again tomorrow.",
      },
    };
  }

  // Always log the attempt (succeeded flag flipped at the bottom on
  // success). This means even rejected validations contribute to the
  // throttle, which is the right behavior — a brute-forcer rapidly
  // probing slugs shouldn't get an unlimited budget.
  const { data: attemptRow } = await admin
    .from("agency_signup_attempts")
    .insert({
      ip,
      email: parsed.data.adminEmail,
      agency_slug: parsed.data.agencySlug,
    })
    .select("id")
    .single();
  const attemptId = attemptRow?.id ?? null;

  // Slug uniqueness check
  const { data: existingAgency } = await admin
    .from("agencies")
    .select("id")
    .eq("slug", parsed.data.agencySlug)
    .maybeSingle();
  if (existingAgency) {
    return {
      ok: false,
      error: { code: "SLUG_TAKEN", message: "That slug is already in use", field: "agencySlug" },
    };
  }

  // Reject signups for emails that already have an account. Previous
  // behavior silently auto-joined the existing user as agency_admin —
  // a consent bypass: a hostile signup could attach any victim's email
  // to a new agency they'd never asked to join. The right flow for an
  // existing user is to sign in first, then accept an explicit
  // invitation from the agency-side member-management UI (future work).
  //
  // Lookup uses the paginated listUsers API filtered by email — the
  // earlier `perPage: 200` was a silent cap that truncated past 200
  // users. There's no `getUserByEmail` helper, but `listUsers({ email })`
  // accepts a server-side filter param.
  const { data: emailLookup, error: lookupErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
    // @ts-expect-error — supabase-js types omit the `email` filter, but
    // the underlying GoTrue admin endpoint accepts it
    email: parsed.data.adminEmail,
  });
  if (lookupErr) {
    return { ok: false, error: { code: "LOOKUP_FAILED", message: lookupErr.message } };
  }
  const conflictingUser = emailLookup.users.find(
    (u) => u.email?.toLowerCase() === parsed.data.adminEmail.toLowerCase(),
  );
  if (conflictingUser) {
    return {
      ok: false,
      error: {
        code: "EMAIL_TAKEN",
        message:
          "An account with that email already exists. Sign in first, then we'll connect you to a new agency.",
        field: "adminEmail",
      },
    };
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.adminEmail,
    email_confirm: false,
    user_metadata: { full_name: parsed.data.adminFullName },
  });
  if (createErr) {
    return {
      ok: false,
      error: { code: "USER_CREATE_FAILED", message: createErr.message },
    };
  }
  const userId = created.user.id;

  // Create the agency
  const { data: agencyRow, error: agencyErr } = await admin
    .from("agencies")
    .insert({
      slug: parsed.data.agencySlug,
      name: parsed.data.agencyName,
      created_by: userId,
    })
    .select("id")
    .single();
  if (agencyErr) {
    return { ok: false, error: { code: agencyErr.code, message: agencyErr.message } };
  }

  // Link the user as agency_admin (accepted immediately since they're the founder)
  const { error: memErr } = await admin.from("agency_memberships").insert({
    agency_id: agencyRow.id,
    user_id: userId,
    role: "agency_admin",
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
  });
  if (memErr) {
    // Roll back the agency on membership failure
    await admin.from("agencies").delete().eq("id", agencyRow.id);
    return { ok: false, error: { code: memErr.code, message: memErr.message } };
  }

  // Send magic link to confirm email + sign in
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
      subject: `Welcome to Arbor — finish setting up ${parsed.data.agencyName}`,
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

  // Mark the throttle row as succeeded so we can track conversion vs.
  // attempts in audit queries (and future fraud analysis).
  if (attemptId) {
    await admin.from("agency_signup_attempts").update({ succeeded: true }).eq("id", attemptId);
  }

  return { ok: true, data: { agencyId: agencyRow.id, emailSent } };
}
