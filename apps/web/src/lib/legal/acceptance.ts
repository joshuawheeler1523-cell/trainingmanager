import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { LEGAL_VERSIONS, type LegalDocumentKey } from "./versions";

/**
 * Records one or more legal-document acceptances. Idempotent via the
 * unique constraint (user_id, email, document_key, version, context) on
 * legal_acceptances — re-recording the same acceptance is a no-op.
 *
 * Captures requesting IP + user-agent best-effort from forwarded
 * headers. We don't trust them for auth; they're just evidence that the
 * acceptance came from a real browser session.
 */
export async function recordAcceptance(args: {
  documents: LegalDocumentKey[];
  userId?: string | null;
  email?: string | null;
  context: "signup" | "agency_signup" | "reauth" | "admin_action" | "cookie_banner" | "baa_request";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (args.documents.length === 0) return;
  if (!args.userId && !args.email) return; // need at least one identifier

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  const userAgent = headersList.get("user-agent") ?? null;

  const admin = createAdminClient();
  const rows = args.documents.map((doc) => ({
    user_id: args.userId ?? null,
    email: args.email ?? null,
    document_key: doc,
    version: LEGAL_VERSIONS[doc],
    ip,
    user_agent: userAgent,
    context: args.context,
    metadata: (args.metadata ?? null) as Json | null,
  }));

  // upsert via the unique constraint — duplicate acceptance is a no-op
  await admin.from("legal_acceptances").upsert(rows, {
    onConflict: "user_id,email,document_key,version,context",
    ignoreDuplicates: true,
  });
}

/**
 * Returns the keys of any legal documents the user has NOT accepted at
 * their current version. Used by /agency layout + /onboarding to nag
 * users into re-accepting after a doc version bump.
 */
export async function unacceptedDocuments(
  userId: string,
  documents: LegalDocumentKey[] = ["terms", "privacy"],
): Promise<LegalDocumentKey[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("legal_acceptances")
    .select("document_key, version")
    .eq("user_id", userId)
    .in("document_key", documents);

  const acceptedSet = new Set((data ?? []).map((r) => `${r.document_key}:${r.version}`));
  return documents.filter((doc) => !acceptedSet.has(`${doc}:${LEGAL_VERSIONS[doc]}`));
}
