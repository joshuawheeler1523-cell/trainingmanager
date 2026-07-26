import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * White-Label Phase 6 — API key issuance + verification.
 *
 * Format: `arbor_<env>_<32 random url-safe chars>` where env is
 * "live" or "test".
 *
 * The stored `key_prefix` is the leading 23 chars — the 11-char `arbor_<env>_`
 * tag plus 12 characters of the secret — and carries a UNIQUE index. That
 * matters for more than lookup speed: a shorter prefix would match many rows,
 * and each candidate costs a bcrypt compare, so an unauthenticated caller
 * could amplify garbage tokens into arbitrary CPU. At 23 chars a token selects
 * at most one row, so an invalid token costs one indexed lookup and no bcrypt.
 */

const ENV_TAG_LENGTH = 11; // "arbor_live_" / "arbor_test_"
const PREFIX_SECRET_CHARS = 12; // secret chars retained in the stored prefix
const KEY_PREFIX_LENGTH = ENV_TAG_LENGTH + PREFIX_SECRET_CHARS; // 23
const SECRET_LENGTH = 32;
const FULL_KEY_LENGTH = ENV_TAG_LENGTH + SECRET_LENGTH; // 43
const BCRYPT_ROUNDS = 10;

/** Requests allowed per key per window. Override with ARBOR_API_RATE_LIMIT. */
const RATE_LIMIT = Number(process.env["ARBOR_API_RATE_LIMIT"] ?? "600") || 600;
const RATE_WINDOW_SECONDS = 60;

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
 */
export type VerifiedKey = { orgId: string; keyId: string; scopes: string[] };

export async function verifyApiKey(full: string): Promise<VerifiedKey | null> {
  // Exact length: `arbor_<env>_` is 11 chars and the secret is 32.
  if (!full.startsWith("arbor_") || full.length !== FULL_KEY_LENGTH) return null;
  const prefix = full.slice(0, KEY_PREFIX_LENGTH);

  const admin = createAdminClient();
  // key_prefix is UNIQUE, so this is at most one row.
  const { data: candidate } = await admin
    .from("api_keys")
    .select("id, org_id, key_hash, scopes")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .maybeSingle();
  if (!candidate) return null;

  if (!(await bcrypt.compare(full, candidate.key_hash))) return null;

  // Fire-and-forget last_used update
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", candidate.id);

  return { orgId: candidate.org_id, keyId: candidate.id, scopes: candidate.scopes };
}

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/** Bumps the fixed-window counter for a key and reports whether it's still under the limit. */
export async function recordApiRequest(keyId: string): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("record_api_request", {
      p_api_key_id: keyId,
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    })
    .maybeSingle();

  // Fail open on a counter outage — a rate limiter that can't reach the
  // database shouldn't take the whole API down with it.
  if (error || !data) return { allowed: true, count: 0, retryAfterSeconds: 0 };

  return {
    allowed: data.allowed,
    count: data.request_count,
    retryAfterSeconds: data.retry_after_seconds,
  };
}

/**
 * Extracts the bearer token from a Request, verifies it, and applies the
 * per-key rate limit. Returns { orgId, keyId, scopes } on success or a
 * Response (401/403/429) on failure.
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
    return problemResponse(401, "unauthorized");
  }
  const token = auth.slice("Bearer ".length).trim();
  const result = await verifyApiKey(token);
  if (!result) {
    return problemResponse(401, "invalid_api_key");
  }
  if (!result.scopes.includes(requiredScope)) {
    return problemResponse(
      403,
      "insufficient_scope",
      `This API key does not have the '${requiredScope}' scope`,
    );
  }

  const rate = await recordApiRequest(result.keyId);
  if (!rate.allowed) {
    return problemResponse(
      429,
      "rate_limit_exceeded",
      `Limit is ${String(RATE_LIMIT)} requests per ${String(RATE_WINDOW_SECONDS)}s. ` +
        `Retry in ${String(rate.retryAfterSeconds)}s.`,
      {
        "Retry-After": String(rate.retryAfterSeconds),
        "RateLimit-Limit": String(RATE_LIMIT),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(rate.retryAfterSeconds),
      },
    );
  }

  return result;
}

/** Standard problem-details JSON response (RFC 7807). */
export function problemResponse(
  status: number,
  title: string,
  detail?: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title,
      status,
      ...(detail ? { detail } : {}),
    }),
    {
      status,
      headers: { "Content-Type": "application/problem+json", ...headers },
    },
  );
}
