import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * White-Label Phase 6 — API key issuance + verification.
 *
 * Format: `arbor_<env>_<32 random url-safe chars>` where env is
 * "live" or "test". The prefix `arbor_<env>_` is stored unhashed so
 * lookups can narrow on it before doing the bcrypt compare.
 */

const KEY_PREFIX_LENGTH = 12; // "arbor_live_" or "arbor_test_"
const SECRET_LENGTH = 32;
const BCRYPT_ROUNDS = 10;

export type Env = "live" | "test";

export function generateApiKey(env: Env): { full: string; prefix: string } {
  const secret = randomBytes(SECRET_LENGTH).toString("base64url").slice(0, SECRET_LENGTH);
  const full = `arbor_${env}_${secret}`;
  return { full, prefix: full.slice(0, KEY_PREFIX_LENGTH) };
}

export async function hashApiKey(full: string): Promise<string> {
  return bcrypt.hash(full, BCRYPT_ROUNDS);
}

/**
 * Verifies a Bearer token from `Authorization: Bearer <key>`. Returns the
 * org_id if valid, null if not. Updates last_used_at on success.
 *
 * Performs a narrow lookup by key_prefix first (indexed) so we typically
 * bcrypt-compare against one row.
 */
export type VerifiedKey = { orgId: string; keyId: string; scopes: string[] };

export async function verifyApiKey(full: string): Promise<VerifiedKey | null> {
  if (!full.startsWith("arbor_") || full.length < KEY_PREFIX_LENGTH + SECRET_LENGTH) return null;
  const prefix = full.slice(0, KEY_PREFIX_LENGTH);

  const admin = createAdminClient();
  const { data: candidates } = await admin
    .from("api_keys")
    .select("id, org_id, key_hash, scopes")
    .eq("key_prefix", prefix)
    .is("revoked_at", null);
  if (!candidates || candidates.length === 0) return null;

  for (const cand of candidates) {
    if (await bcrypt.compare(full, cand.key_hash)) {
      // Fire-and-forget last_used update
      void admin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", cand.id);
      return { orgId: cand.org_id, keyId: cand.id, scopes: cand.scopes };
    }
  }
  return null;
}

/**
 * Extracts the bearer token from a Request and verifies it. Returns
 * { orgId, keyId, scopes } on success or a Response (401/403) on failure.
 *
 * `requiredScope` is checked against the key's scopes array. Default
 * issuance is ['read','write']; a future UI can issue read-only keys
 * for safer integrations and they'll be blocked from write endpoints
 * automatically.
 */
export async function authApiRequest(
  req: Request,
  requiredScope: "read" | "write" = "read",
): Promise<VerifiedKey | Response> {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ type: "about:blank", title: "unauthorized", status: 401 }),
      {
        status: 401,
        headers: { "Content-Type": "application/problem+json" },
      },
    );
  }
  const token = auth.slice("Bearer ".length).trim();
  const result = await verifyApiKey(token);
  if (!result) {
    return new Response(
      JSON.stringify({ type: "about:blank", title: "invalid_api_key", status: 401 }),
      {
        status: 401,
        headers: { "Content-Type": "application/problem+json" },
      },
    );
  }
  if (!result.scopes.includes(requiredScope)) {
    return new Response(
      JSON.stringify({
        type: "about:blank",
        title: "insufficient_scope",
        status: 403,
        detail: `This API key does not have the '${requiredScope}' scope`,
      }),
      { status: 403, headers: { "Content-Type": "application/problem+json" } },
    );
  }
  return result;
}

/** Standard problem-details JSON response (RFC 7807). */
export function problemResponse(status: number, title: string, detail?: string): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title,
      status,
      ...(detail ? { detail } : {}),
    }),
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
