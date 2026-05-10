import { NextResponse } from "next/server";
import { authApiRequest, problemResponse } from "@/lib/api-keys";
import { decodeCursor } from "@/lib/api-cursor";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);
  const cursor = url.searchParams.get("cursor");

  const admin = createAdminClient();
  let query = admin
    .from("tras")
    .select("*")
    .eq("org_id", auth.orgId)
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
  if (error) return problemResponse(500, "query_failed", error.message);

  const rows = data;
  const last = rows[rows.length - 1];
  const nextCursor =
    last && rows.length === limit
      ? Buffer.from(JSON.stringify({ ts: last.created_at, id: last.id })).toString("base64url")
      : null;

  return NextResponse.json({ data: rows, next_cursor: nextCursor });
}
