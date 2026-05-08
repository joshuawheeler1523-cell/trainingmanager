// Generic XLSX + CSV exporters per report. PDF stays per-report (each report
// has its own React-PDF document) — they don't fit a generic shape.
//
// Strategy: each report turns its dataset into a list of named "sheets", each
// sheet being { name, columns, rows } where rows is an array of plain objects.
// The XLSX exporter creates a workbook with one tab per sheet; the CSV
// exporter concatenates sheets with a blank line between them.

import * as XLSX from "xlsx";
import type {
  AllocationDataset,
  CoverageDataset,
  ProjectStatusDataset,
  ReportDataset,
  SkillGapDataset,
  WorkloadDataset,
} from "@arbor/shared";

export type ExportSheet = {
  name: string;
  columns: string[];
  rows: Record<string, string | number | null>[];
};

// Convert a ReportDataset into a list of XLSX-ready sheets.
export function datasetToSheets(dataset: ReportDataset): ExportSheet[] {
  switch (dataset.slug) {
    case "allocation":
      return allocationSheets(dataset.data);
    case "workload":
      return workloadSheets(dataset.data);
    case "coverage":
      return coverageSheets(dataset.data);
    case "project-status":
      return projectStatusSheets(dataset.data);
    case "skill-gap":
      return skillGapSheets(dataset.data);
  }
}

// ── XLSX ────────────────────────────────────────────────────────────────────

export function writeXlsx(sheets: ExportSheet[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.columns });
    ws["!cols"] = sheet.columns.map(() => ({ wch: 18 }));
    // SheetJS sanitizes sheet names but caps at 31 chars and disallows certain
    // characters. Strip and trim defensively.
    const safeName = sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName || "Sheet");
  }
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Uint8Array(buffer);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function writeCsv(sheets: ExportSheet[]): string {
  // Multi-sheet CSV: emit a heading line per sheet, then rows, then a blank
  // separator. Excel will open this fine in a single column-delimited view.
  const parts: string[] = [];
  for (const sheet of sheets) {
    if (parts.length > 0) parts.push("");
    parts.push(`# ${sheet.name}`);
    parts.push(sheet.columns.map(csvCell).join(","));
    for (const row of sheet.rows) {
      parts.push(sheet.columns.map((c) => csvCell(row[c] ?? "")).join(","));
    }
  }
  return parts.join("\n");
}

function csvCell(v: string | number | null): string {
  if (v == null) return "";
  const s = typeof v === "number" ? v.toString() : v;
  // RFC 4180: quote if contains comma, quote, CR, or LF.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── per-report sheet builders ──────────────────────────────────────────────

function allocationSheets(d: AllocationDataset): ExportSheet[] {
  return [
    {
      name: "Buckets",
      columns: [
        "Bucket",
        "Target %",
        "Actual %",
        "Variance",
        "Hours",
        "Top consumer 1",
        "Top consumer 2",
        "Top consumer 3",
      ],
      rows: d.buckets.map((b) => ({
        Bucket: b.bucket_name,
        "Target %": round(b.target_percent),
        "Actual %": round(b.actual_percent),
        Variance: round(b.variance_percent),
        Hours: round(b.actual_hours),
        "Top consumer 1": fmtConsumer(b.top_consumers[0]),
        "Top consumer 2": fmtConsumer(b.top_consumers[1]),
        "Top consumer 3": fmtConsumer(b.top_consumers[2]),
      })),
    },
    {
      name: "Utilization Histogram",
      columns: ["Band", "Count"],
      rows: d.utilization_histogram.map((h) => ({
        Band: h.band.replace(/_/g, " "),
        Count: h.count,
      })),
    },
    {
      name: "Summary",
      columns: ["Metric", "Value"],
      rows: [
        { Metric: "Total hours", Value: round(d.total_hours) },
        { Metric: "High-priority %", Value: round(d.high_priority_percent) },
        { Metric: "Unallocated hours", Value: round(d.unallocated_hours) },
      ],
    },
  ];
}

function fmtConsumer(c?: { instructor_name: string; hours: number }): string {
  if (!c) return "";
  return `${c.instructor_name} (${round(c.hours).toString()}h)`;
}

function workloadSheets(d: WorkloadDataset): ExportSheet[] {
  return [
    {
      name: "Workload",
      columns: [
        "Instructor",
        "Available (h)",
        "Assigned (h)",
        "Utilization %",
        "Band",
        "Classes (h)",
        "Recurring (h)",
        "Ad-hoc (h)",
        "Requests (h)",
        "Project tasks (h)",
      ],
      rows: d.rows.map((r) => ({
        Instructor: r.full_name,
        "Available (h)": round(r.annual_hours),
        "Assigned (h)": round(r.assigned_hours),
        "Utilization %": r.utilization_pct == null ? "" : round(r.utilization_pct),
        Band: r.utilization_band ?? "—",
        "Classes (h)": round(r.sources.class),
        "Recurring (h)": round(r.sources.recurring_task),
        "Ad-hoc (h)": round(r.sources.ad_hoc_task),
        "Requests (h)": round(r.sources.education_request),
        "Project tasks (h)": round(r.sources.project_task),
      })),
    },
  ];
}

function coverageSheets(d: CoverageDataset): ExportSheet[] {
  return [
    {
      name: "Coverage",
      columns: [
        "Class",
        "Bucket",
        "Target offerings",
        "Assigned offerings",
        "Coverage %",
        "Qualified instructors",
        "Skill gap",
        "No assignee",
      ],
      rows: d.rows.map((r) => ({
        Class: r.class_name,
        Bucket: r.bucket_name ?? "—",
        "Target offerings": r.target_offerings,
        "Assigned offerings": r.assigned_offerings,
        "Coverage %": r.coverage_percent,
        "Qualified instructors": r.qualified_instructor_count,
        "Skill gap": r.has_skill_gap ? "yes" : "no",
        "No assignee": r.has_no_assignee ? "yes" : "no",
      })),
    },
  ];
}

function projectStatusSheets(d: ProjectStatusDataset): ExportSheet[] {
  return [
    {
      name: "Projects",
      columns: [
        "Project",
        "Status",
        "Priority",
        "Start",
        "End",
        "% complete",
        "Tasks",
        "Overdue tasks",
        "Milestones",
        "Milestones complete",
      ],
      rows: d.rows.map((r) => ({
        Project: r.name,
        Status: r.status,
        Priority: r.priority,
        Start: r.start_date ?? "",
        End: r.end_date ?? "",
        "% complete": r.percent_complete ?? 0,
        Tasks: r.task_count,
        "Overdue tasks": r.overdue_task_count,
        Milestones: r.milestone_count,
        "Milestones complete": r.milestones_complete,
      })),
    },
  ];
}

function skillGapSheets(d: SkillGapDataset): ExportSheet[] {
  return [
    {
      name: "Insufficient coverage",
      columns: ["Skill", "Qualified", "Threshold"],
      rows: d.insufficient_coverage.map((r) => ({
        Skill: r.skill_name,
        Qualified: r.qualified_count,
        Threshold: r.threshold,
      })),
    },
    {
      name: "Expiring certifications",
      columns: ["Instructor", "Skill", "Expires", "Days remaining"],
      rows: d.expiring_certs.map((r) => ({
        Instructor: r.instructor_name,
        Skill: r.skill_name,
        Expires: r.expires_at,
        "Days remaining": r.days_remaining,
      })),
    },
    {
      name: "Over coverage",
      columns: ["Skill", "Qualified"],
      rows: d.over_coverage.map((r) => ({
        Skill: r.skill_name,
        Qualified: r.qualified_count,
      })),
    },
  ];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
