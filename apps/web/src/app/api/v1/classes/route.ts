import { NextResponse } from "next/server";
import { authApiRequest, problemResponse } from "@/lib/api-keys";
import { decodeCursor } from "@/lib/api-cursor";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pinned so the public response shape is a deliberate contract rather than
// whatever columns the table happens to have. Excludes internal audit columns
// (created_by/updated_by/version) and org_id (every row is already org-scoped).
// Must stay a single string literal (not a joined array or concatenation) so
// supabase-js can infer the row type from it.
// prettier-ignore
const CLASS_FIELDS = "id, name, description, status, department_id, allocation_bucket_id, module_id, offerings_per_year, hours_per_day, total_days, is_multi_day, custom_day_hours, prep_hours_per_offering, logistics_hours_per_offering, target_audience, prerequisites, created_at, updated_at";

export async function GET(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
  const cursor = url.searchParams.get("cursor");

  const admin = createAdminClient();
  let query = admin
    .from("classes")
    .select(CLASS_FIELDS)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

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
    reportError(error, { orgId: auth.orgId, operation: "api.v1.classes.list" });
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
