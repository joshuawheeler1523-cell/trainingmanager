import { NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getDepartmentScope } from "@/lib/auth/current-department";
import { REPORT_METADATA, REPORT_SLUGS, type ReportSlug } from "@arbor/shared";
import { runReport } from "@/lib/reports/registry";
import { datasetToSheets, writeCsv, writeXlsx } from "@/lib/reports/exporters";
import { ReportPdf } from "@/components/pdf/reports/report-pdf";
import { recordReportRun } from "@/app/(authenticated)/reports/actions";

// PDF + XLSX both need the Node runtime (xlsx uses node:fs/stream;
// @react-pdf/renderer uses node:fs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FORMATS = new Set(["pdf", "xlsx", "csv"]);

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!REPORT_SLUGS.includes(slug as ReportSlug)) {
    return new NextResponse("Unknown report", { status: 404 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "pdf";
  if (!ALLOWED_FORMATS.has(format)) {
    return new NextResponse("Unknown format", { status: 400 });
  }
  const savedId = url.searchParams.get("saved");

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

  // Run the report once; reuse the dataset for both render paths.
  const startedAt = Date.now();
  let dataset;
  try {
    dataset = await runReport(slug as ReportSlug, supabase, orgId, departmentId, filters);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Report failed";
    return new NextResponse(msg, { status: 422 });
  }

  const meta = REPORT_METADATA[slug as ReportSlug];
  const safeName = meta.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (format === "csv") {
    const csv = writeCsv(datasetToSheets(dataset));
    void recordReportRun({
      slug,
      filters,
      format: "csv",
      rowCount: csv.split("\n").length,
      durationMs: Date.now() - startedAt,
      savedReportId: savedId,
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const xlsxBytes = writeXlsx(datasetToSheets(dataset));
    void recordReportRun({
      slug,
      filters,
      format: "xlsx",
      rowCount: null,
      durationMs: Date.now() - startedAt,
      savedReportId: savedId,
    });
    // Wrap in a Blob so the strict NextResponse BodyInit type is satisfied.
    // Cast through ArrayBuffer to dodge the SharedArrayBuffer-vs-ArrayBuffer
    // false-positive — Node's Buffer-backed Uint8Array always uses a real
    // ArrayBuffer here.
    const arrayBuffer = xlsxBytes.buffer.slice(
      xlsxBytes.byteOffset,
      xlsxBytes.byteOffset + xlsxBytes.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(new Blob([arrayBuffer]), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      },
    });
  }

  // PDF
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName = org?.name ?? "Organization";

  const stream = await renderToStream(
    <ReportPdf dataset={dataset} orgName={orgName} reportName={meta.name} />,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const body = new Uint8Array(buffer);

  void recordReportRun({
    slug,
    filters,
    format: "pdf",
    rowCount: null,
    durationMs: Date.now() - startedAt,
    savedReportId: savedId,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
    },
  });
}
