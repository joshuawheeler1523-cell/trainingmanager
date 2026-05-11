import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe. Returns 200 with `{ ok: true }` when the
 * application can reach Postgres; 503 with diagnostic detail otherwise.
 *
 * Intentionally lightweight — uses the admin client to do a single
 * `SELECT 1` so it doesn't require an authenticated user. Vercel
 * observability + uptime monitors (Better Uptime, Pingdom, Cronitor)
 * should poll this once per minute.
 *
 * NEVER returns sensitive info. The `degraded` field surfaces what
 * subsystem failed (currently only the database) so an operator can
 * triage; specific error messages are NOT leaked.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const elapsedMs = Date.now() - startedAt;
  const ok = dbOk;
  const body = {
    ok,
    timestamp: new Date().toISOString(),
    elapsed_ms: elapsedMs,
    checks: {
      database: dbOk ? "ok" : "fail",
    },
    version: process.env["VERCEL_GIT_COMMIT_SHA"]?.slice(0, 7) ?? "dev",
  };

  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
