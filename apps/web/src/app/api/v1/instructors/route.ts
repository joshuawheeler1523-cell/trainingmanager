import { NextResponse } from "next/server";
import { authApiRequest, problemResponse } from "@/lib/api-keys";
import { decodeCursor } from "@/lib/api-cursor";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/instructors
 * Cursor-based pagination via ?limit=50&cursor=<opaque base64>.
 * Cursor encodes the last seen (created_at, id) tuple.
 *
 * Returns internal instructors only by default. External / consultant
 * trainers — the org-level pool used by Training Planner — are filtered out.
 * Pass `?include_external=true` to include them.
 */
export async function GET(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
  const cursor = url.searchParams.get("cursor");
  const includeExternal = url.searchParams.get("include_external") === "true";

  const admin = createAdminClient();
  let query = admin
    .from("instructors")
    .select("id, full_name, email, status, department_id, created_at, is_external")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (!includeExternal) {
    query = query.eq("is_external", false);
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) return problemResponse(400, "invalid_cursor");
    query = query.or(
      `created_at.lt.${decoded.ts},and(created_at.eq.${decoded.ts},id.lt.${decoded.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    // Log the driver message; don't hand database internals to an API consumer.
    reportError(error, { orgId: auth.orgId, operation: "api.v1.instructors.list" });
    return problemResponse(500, "query_failed");
  }

  const rows = data;
  const last = rows[rows.length - 1];
  const nextCursor =
    last && rows.length === limit
      ? Buffer.from(JSON.stringify({ ts: last.created_at, id: last.id })).toString("base64url")
      : null;

  return NextResponse.json({ data: rows, next_cursor: nextCursor });
}
