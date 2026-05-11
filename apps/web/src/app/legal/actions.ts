"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recordAcceptance } from "@/lib/legal/acceptance";
import type { LegalDocumentKey } from "@/lib/legal/versions";
import { headers } from "next/headers";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Server action invoked by client-side acceptance checkboxes (e.g. on the
 * agency-signup form). When the user is already signed in we record
 * against user_id; when called pre-auth (signup flows), the caller passes
 * an email so we can match the acceptance once the user account is
 * created.
 */
export async function recordLegalAcceptanceAction(args: {
  documents: LegalDocumentKey[];
  email?: string;
  context?: "signup" | "agency_signup" | "reauth" | "admin_action";
}): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await recordAcceptance({
    documents: args.documents,
    userId: user?.id ?? null,
    email: args.email ?? user?.email ?? null,
    context: args.context ?? "admin_action",
  });
  return { ok: true, data: true };
}

/**
 * Cookie consent capture. Called by the cookie banner after the user
 * clicks Accept all / Reject non-essential / Save preferences. Stores
 * the choices server-side as evidence + sets a cookie via the response
 * for client-side gating.
 */
export async function recordCookieConsentAction(args: {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  sessionId: string;
  source?: "banner" | "preferences" | "reset";
}): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  const userAgent = headersList.get("user-agent") ?? null;

  const admin = createAdminClient();
  await admin.from("cookie_consents").insert({
    user_id: user?.id ?? null,
    session_id: args.sessionId,
    necessary: true,
    analytics: args.analytics,
    marketing: args.marketing,
    ip,
    user_agent: userAgent,
    source: args.source ?? "banner",
  });

  // Also record the cookies-policy acceptance for audit trail.
  if (user?.id || args.sessionId) {
    await admin.from("legal_acceptances").upsert(
      [
        {
          user_id: user?.id ?? null,
          email: user?.email ?? null,
          document_key: "cookies",
          version: (await import("@/lib/legal/versions")).LEGAL_VERSIONS.cookies,
          ip,
          user_agent: userAgent,
          context: "cookie_banner",
          metadata: { analytics: args.analytics, marketing: args.marketing },
        },
      ],
      { onConflict: "user_id,email,document_key,version,context", ignoreDuplicates: true },
    );
  }

  return { ok: true, data: true };
}
