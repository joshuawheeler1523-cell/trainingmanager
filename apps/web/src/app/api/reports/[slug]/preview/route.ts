import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getDepartmentScope } from "@/lib/auth/current-department";
import { REPORT_SLUGS, type ReportSlug } from "@arbor/shared";
import { runReport } from "@/lib/reports/registry";
import { recordReportRun } from "@/app/(authenticated)/reports/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// JSON preview endpoint that the /reports/[slug] runner polls as filters
// change. Records each run as `format: 'preview'` so we can audit which
// filter combinations got tried.

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!REPORT_SLUGS.includes(slug as ReportSlug)) {
    return new NextResponse("Unknown report", { status: 404 });
  }

  const url = new URL(req.url);
  const filtersRaw = url.searchParams.get("filters") ?? "{}";
  let filters: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(filtersRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      filters = parsed as Record<string, unknown>;
    }
  } catch {
    return new NextResponse("Invalid filters JSON", { status: 400 });
  }

  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) return new NextResponse("Unauthorized", { status: 401 });
  const departmentId = scope.all ? null : scope.id;

  const startedAt = Date.now();
  let dataset;
  try {
    dataset = await runReport(slug as ReportSlug, supabase, orgId, departmentId, filters);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Report failed";
    return new NextResponse(msg, { status: 422 });
  }
  const durationMs = Date.now() - startedAt;

  // Fire-and-forget audit row. Don't block the preview if the audit insert
  // fails — the user still needs the data.
  void recordReportRun({
    slug,
    filters,
    format: "preview",
    rowCount: countRows(dataset),
    durationMs,
  });

  return NextResponse.json(dataset);
}

function countRows(d: { slug: string; data: unknown }): number {
  // Best-effort row count for the audit log. Each report exposes a primary
  // collection that's the natural "row count".
  const data = d.data as Record<string, unknown>;
  switch (d.slug) {
    case "workload":
    case "coverage":
    case "project-status":
      return (data.rows as unknown[] | undefined)?.length ?? 0;
    case "allocation":
      return (data.buckets as unknown[] | undefined)?.length ?? 0;
    case "skill-gap":
      return (
        ((data.insufficient_coverage as unknown[] | undefined)?.length ?? 0) +
        ((data.expiring_certs as unknown[] | undefined)?.length ?? 0) +
        ((data.over_coverage as unknown[] | undefined)?.length ?? 0)
      );
    default:
      return 0;
  }
}
