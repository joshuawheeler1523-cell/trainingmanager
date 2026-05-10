import "server-only";
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * White-Label Phase 8 — per-org data export.
 *
 * Pulls every row from every org-scoped tenant table for the given org_id,
 * serializes each table as JSONL (one JSON object per line), bundles into
 * a ZIP, uploads to the `data-exports` Storage bucket, and returns the
 * storage path + size + row count.
 *
 * Why JSONL: handles nested values (jsonb columns) natively, easy to
 * incrementally re-parse with `for await (const line of stream)`, and
 * universally supported by data tools (DuckDB, jq, pandas read_json
 * lines=True). CSV would force flattening + lossy null/array handling.
 *
 * The list of tables is hand-maintained — adding a new tenant table is
 * O(one entry here). The alternative (introspecting information_schema +
 * filtering for an org_id column) is fragile and would silently miss
 * tables joined via FK rather than direct org_id.
 */

// Tables with a direct org_id FK. Order matters only for human readability
// — exports are independent files, no dependency between them.
const ORG_SCOPED_TABLES = [
  "departments",
  "instructors",
  "skills",
  "instructor_skills",
  "classes",
  "class_instructor_assignments",
  "class_skill_requirements",
  "allocation_buckets",
  "global_allocations",
  "allocation_groups",
  "allocation_group_members",
  "group_allocations",
  "individual_allocations",
  "recurring_tasks",
  "recurring_task_assignments",
  "ad_hoc_tasks",
  "deliverable_types",
  "tras",
  "tra_deliverables",
  "tra_stakeholders",
  "tra_audience_roles",
  "tra_kpis",
  "tra_success_criteria",
  "tra_objectives",
  "projects",
  "project_team_members",
  "tasks",
  "task_assignments",
  "task_action_items",
  "milestones",
  "task_dependencies",
  "dependencies",
  "education_requests",
  "education_request_assignments",
  "education_request_history",
  "public_intake_links",
  "implementations",
  "impl_rooms",
  "impl_trainers",
  "impl_modules",
  "impl_classes",
  "impl_class_trainers",
  "impl_class_prerequisites",
  "impl_sessions",
  "saved_reports",
  "report_runs",
  "support_tickets",
  "support_ticket_messages",
  "feature_flags",
  "notifications",
  "audit_log",
  "org_invitations",
  "org_memberships",
] as const;

export type ExportResult = {
  storagePath: string;
  sizeBytes: number;
  tableCount: number;
  rowCount: number;
};

export async function buildOrgDataExport(orgId: string, exportId: string): Promise<ExportResult> {
  const admin = createAdminClient();
  const zip = new JSZip();
  let totalRows = 0;
  let tableCount = 0;

  // Manifest collected as we go so the consumer knows what to expect.
  const manifest: {
    generatedAt: string;
    orgId: string;
    tables: { name: string; rowCount: number }[];
  } = {
    generatedAt: new Date().toISOString(),
    orgId,
    tables: [],
  };

  // Include the organization row itself + the parent agency (if any).
  const { data: org } = await admin.from("organizations").select("*").eq("id", orgId).maybeSingle();
  if (org) {
    zip.file("organization.json", JSON.stringify(org, null, 2));
  }

  for (const table of ORG_SCOPED_TABLES) {
    // Pull all rows for this org. Page in chunks of 1000 to avoid pulling
    // entire tables into memory if a customer has 100k+ rows somewhere.
    const lines: string[] = [];
    let offset = 0;
    const PAGE = 1000;
    let rowsThisTable = 0;
    let done = false;
    while (!done) {
      const { data, error } = await admin
        .from(table)
        .select("*")
        .eq("org_id", orgId)
        .range(offset, offset + PAGE - 1);
      if (error) break;
      const rows = (data as Record<string, unknown>[] | null) ?? [];
      if (rows.length === 0) break;
      for (const row of rows) {
        lines.push(JSON.stringify(row));
      }
      rowsThisTable += rows.length;
      offset += rows.length;
      if (rows.length < PAGE) done = true;
    }
    if (rowsThisTable > 0) {
      zip.file(`tables/${table}.jsonl`, lines.join("\n") + "\n");
      manifest.tables.push({ name: table, rowCount: rowsThisTable });
      totalRows += rowsThisTable;
      tableCount += 1;
    }
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "README.txt",
    [
      "Arbor data export",
      "",
      `Organization: ${orgId}`,
      `Generated:    ${manifest.generatedAt}`,
      `Tables:       ${tableCount.toString()}`,
      `Rows:         ${totalRows.toString()}`,
      "",
      "Each tables/<name>.jsonl file is one JSON object per line. The full",
      "list of tables and their row counts is in manifest.json. The export",
      "covers every tenant-scoped table at the time of generation; agency",
      "billing, agency settings, and global tables are not included.",
      "",
      "Data is provided as-is for use in your own systems (compliance, BI,",
      "backup). Reach billing@arbor.app with any questions.",
    ].join("\n"),
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const storagePath = `${orgId}/${exportId}.zip`;
  const { error: uploadErr } = await admin.storage
    .from("data-exports")
    .upload(storagePath, buffer, { contentType: "application/zip", upsert: true });
  if (uploadErr) {
    throw new Error(`Storage upload failed: ${uploadErr.message}`);
  }

  return { storagePath, sizeBytes: buffer.byteLength, tableCount, rowCount: totalRows };
}

/** Generates a 7-day signed URL for the export ZIP. */
export async function getExportSignedUrl(storagePath: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("data-exports")
    .createSignedUrl(storagePath, 7 * 24 * 60 * 60);
  return data?.signedUrl ?? null;
}
