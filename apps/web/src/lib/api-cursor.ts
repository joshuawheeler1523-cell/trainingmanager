import "server-only";

/**
 * Cursor pagination decoder for /api/v1/* endpoints.
 *
 * The cursor is a base64url-encoded JSON object {ts, id} representing the
 * last seen row's (created_at, id) tuple. Both values are interpolated
 * directly into a PostgREST `.or()` filter expression, so they MUST be
 * validated against their expected shapes — otherwise a hand-crafted
 * cursor can inject filter syntax and bypass the org_id scope.
 *
 * `id` must be a UUID. `ts` must be an ISO-8601 timestamp.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

export function decodeCursor(cursor: string): { ts: string; id: string } | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== "object") return null;
  const obj = decoded as Record<string, unknown>;
  const ts = obj["ts"];
  const id = obj["id"];
  if (typeof ts !== "string" || typeof id !== "string") return null;
  if (!UUID_RE.test(id)) return null;
  if (!ISO_TS_RE.test(ts)) return null;
  return { ts, id };
}
