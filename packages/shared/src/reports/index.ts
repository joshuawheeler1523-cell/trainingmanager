// Report registry — pure metadata + filter schemas. Per-report query
// implementations live in apps/web/src/lib/reports because they need access
// to the typed Supabase client. Preview / PDF components live in
// apps/web/src/components/reports.

import { z } from "zod";

// All slugs the registry knows about. Keep this in sync with the per-slug
// definition modules. New reports get added here AND get a definition file.
export const REPORT_SLUGS = [
  "allocation",
  "workload",
  "coverage",
  "project-status",
  "skill-gap",
  "department-comparison",
  "instructor-scorecard",
] as const;
export type ReportSlug = (typeof REPORT_SLUGS)[number];

// Common filter shape: every report supports a date range and an optional
// "as of" snapshot date. Per-report schemas extend this with their own
// fields (instructor multi-select, bucket, etc.).
const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

export const baseReportFilters = z.object({
  start_date: optionalDate,
  end_date: optionalDate,
});

// ── per-report filter schemas ───────────────────────────────────────────────

export const allocationReportFilters = baseReportFilters.extend({
  bucket_ids: z.array(z.string().uuid()).default([]),
});
export type AllocationReportFilters = z.infer<typeof allocationReportFilters>;

export const workloadReportFilters = baseReportFilters.extend({
  instructor_ids: z.array(z.string().uuid()).default([]),
  utilization_band: z
    .enum(["all", "over_allocated", "at_risk", "balanced", "under_utilized"])
    .default("all"),
});
export type WorkloadReportFilters = z.infer<typeof workloadReportFilters>;

export const coverageReportFilters = baseReportFilters.extend({
  bucket_ids: z.array(z.string().uuid()).default([]),
  show_only_gaps: z.coerce.boolean().default(false),
});
export type CoverageReportFilters = z.infer<typeof coverageReportFilters>;

export const projectStatusReportFilters = baseReportFilters.extend({
  status: z
    .array(z.enum(["planning", "active", "on_hold", "completed", "cancelled"]))
    .default(["planning", "active"]),
  priority: z.array(z.enum(["low", "medium", "high", "critical"])).default([]),
});
export type ProjectStatusReportFilters = z.infer<typeof projectStatusReportFilters>;

export const skillGapReportFilters = baseReportFilters.extend({
  // Days into the future to look for expiring certs; default 90 per User
  // Guide §12.2 ("expiration in the next 90 days").
  expiry_window_days: z.coerce.number().int().min(1).max(365).default(90),
});
export type SkillGapReportFilters = z.infer<typeof skillGapReportFilters>;

// Department comparison is a current-state snapshot; it only needs the base
// date range (unused today but kept for parity / future period scoping).
export const departmentComparisonReportFilters = baseReportFilters;
export type DepartmentComparisonReportFilters = z.infer<typeof departmentComparisonReportFilters>;

export const instructorScorecardReportFilters = baseReportFilters.extend({
  instructor_ids: z.array(z.string().uuid()).default([]),
});
export type InstructorScorecardReportFilters = z.infer<typeof instructorScorecardReportFilters>;

// Discriminated union of all filter shapes so a saved-report row's filters
// can be parsed against the correct schema by slug.
export type ReportFilters =
  | AllocationReportFilters
  | WorkloadReportFilters
  | CoverageReportFilters
  | ProjectStatusReportFilters
  | SkillGapReportFilters
  | DepartmentComparisonReportFilters
  | InstructorScorecardReportFilters;

export function filterSchemaForSlug(slug: ReportSlug) {
  switch (slug) {
    case "allocation":
      return allocationReportFilters;
    case "workload":
      return workloadReportFilters;
    case "coverage":
      return coverageReportFilters;
    case "project-status":
      return projectStatusReportFilters;
    case "skill-gap":
      return skillGapReportFilters;
    case "department-comparison":
      return departmentComparisonReportFilters;
    case "instructor-scorecard":
      return instructorScorecardReportFilters;
  }
}

// ── metadata ────────────────────────────────────────────────────────────────
// Display name + one-line description shown on the /reports landing tile
// grid and the per-report page header.

export type ReportMetadata = {
  slug: ReportSlug;
  name: string;
  description: string;
  category: "capacity" | "delivery" | "competency";
};

export const REPORT_METADATA: Record<ReportSlug, ReportMetadata> = {
  allocation: {
    slug: "allocation",
    name: "Resource Allocation Summary",
    description:
      "Bucket-level target % vs actual %, with hours assigned, top consumers, and unallocated capacity.",
    category: "capacity",
  },
  workload: {
    slug: "workload",
    name: "Instructor Workload Report",
    description:
      "Per-instructor utilization with the 6-source breakdown (classes, recurring, ad-hoc, requests, projects, tasks).",
    category: "capacity",
  },
  coverage: {
    slug: "coverage",
    name: "Class Coverage Report",
    description:
      "Per-class assignment status: qualified instructors, assigned offerings, and gaps for upcoming demand.",
    category: "delivery",
  },
  "project-status": {
    slug: "project-status",
    name: "Project Status Report",
    description:
      "Cross-project rollup of status, % complete, milestones achieved, and overdue tasks.",
    category: "delivery",
  },
  "skill-gap": {
    slug: "skill-gap",
    name: "Skill Gap Analysis",
    description:
      "Skills with insufficient coverage, expiring certifications, and over-coverage for hiring guidance.",
    category: "competency",
  },
  "department-comparison": {
    slug: "department-comparison",
    name: "Department Comparison",
    description:
      "Side-by-side rollup per department: headcount, average utilization, active projects, and open work intake — to see where capacity strain concentrates.",
    category: "capacity",
  },
  "instructor-scorecard": {
    slug: "instructor-scorecard",
    name: "Instructor Scorecard",
    description:
      "Per-instructor one-pager: utilization, classes qualified vs assigned, skills held, and certifications expiring in 90 days.",
    category: "capacity",
  },
};

// ── saved-report Zod schemas ────────────────────────────────────────────────

export const savedReportInsertSchema = z.object({
  slug: z.enum(REPORT_SLUGS),
  name: z.string().min(1, "Name is required").max(200),
  description: z
    .string()
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  filters: z.record(z.unknown()).default({}),
  org_visibility: z.coerce.boolean().default(false),
});

export const savedReportUpdateSchema = savedReportInsertSchema.partial();

export type SavedReportInput = z.infer<typeof savedReportInsertSchema>;
export type SavedReportUpdate = z.infer<typeof savedReportUpdateSchema>;

export type SavedReport = {
  id: string;
  org_id: string;
  slug: ReportSlug;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  org_visibility: boolean;
  schedule_cron: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

export type ReportRun = {
  id: string;
  org_id: string;
  slug: ReportSlug;
  saved_report_id: string | null;
  filters: Record<string, unknown>;
  format: "pdf" | "xlsx" | "csv" | "preview";
  row_count: number | null;
  duration_ms: number | null;
  ran_at: string;
  ran_by: string | null;
};

// ── dataset types ───────────────────────────────────────────────────────────
// Each report's query() returns one of these. Both the preview component
// and the PDF/XLSX/CSV exporters consume the same shape, so the data is
// computed once per report run.

export type AllocationDataset = {
  period: { start: string | null; end: string | null };
  buckets: {
    bucket_id: string | null;
    bucket_name: string;
    target_percent: number;
    actual_hours: number;
    actual_percent: number;
    variance_percent: number;
    top_consumers: { instructor_id: string; instructor_name: string; hours: number }[];
  }[];
  utilization_histogram: {
    band: "under_utilized" | "balanced" | "at_risk" | "over_allocated";
    count: number;
  }[];
  high_priority_percent: number; // % of total hours on high/critical project tasks
  unallocated_hours: number; // sum of (annual_hours - assigned_hours) across active instructors
  total_hours: number;
};

export type WorkloadDataset = {
  rows: {
    instructor_id: string;
    full_name: string;
    annual_hours: number;
    assigned_hours: number;
    utilization_pct: number | null;
    utilization_band: "under_utilized" | "balanced" | "at_risk" | "over_allocated" | null;
    sources: {
      class: number;
      recurring_task: number;
      ad_hoc_task: number;
      education_request: number;
      project_task: number;
    };
  }[];
};

export type CoverageDataset = {
  rows: {
    class_id: string;
    class_name: string;
    bucket_name: string | null;
    target_offerings: number;
    assigned_offerings: number;
    qualified_instructor_count: number;
    coverage_percent: number; // assigned / target
    has_skill_gap: boolean; // no instructor has the required skills
    has_no_assignee: boolean;
  }[];
};

export type ProjectStatusDataset = {
  rows: {
    project_id: string;
    name: string;
    status: string;
    priority: string;
    start_date: string | null;
    end_date: string | null;
    percent_complete: number | null;
    task_count: number;
    overdue_task_count: number;
    milestone_count: number;
    milestones_complete: number;
  }[];
};

export type SkillGapDataset = {
  insufficient_coverage: {
    skill_id: string;
    skill_name: string;
    qualified_count: number;
    threshold: number;
  }[];
  expiring_certs: {
    instructor_id: string;
    instructor_name: string;
    skill_id: string;
    skill_name: string;
    expires_at: string;
    days_remaining: number;
  }[];
  over_coverage: {
    skill_id: string;
    skill_name: string;
    qualified_count: number;
  }[];
};

export type DepartmentComparisonDataset = {
  rows: {
    department_id: string;
    department_name: string;
    instructor_count: number;
    total_annual_hours: number;
    total_assigned_hours: number;
    avg_utilization_pct: number | null;
    active_project_count: number;
    open_intake_count: number;
  }[];
  // Org-wide totals for the footer row.
  totals: {
    instructor_count: number;
    total_annual_hours: number;
    total_assigned_hours: number;
    avg_utilization_pct: number | null;
    active_project_count: number;
    open_intake_count: number;
  };
};

export type InstructorScorecardDataset = {
  rows: {
    instructor_id: string;
    full_name: string;
    department: string | null;
    annual_hours: number;
    assigned_hours: number;
    utilization_pct: number | null;
    utilization_band: "under_utilized" | "balanced" | "at_risk" | "over_allocated" | null;
    classes_qualified: number;
    classes_assigned: number;
    skills_count: number;
    expiring_cert_count: number; // certs expiring within 90 days
  }[];
};

// Discriminated dataset union for code that handles all reports generically.
export type ReportDataset =
  | { slug: "allocation"; data: AllocationDataset }
  | { slug: "workload"; data: WorkloadDataset }
  | { slug: "coverage"; data: CoverageDataset }
  | { slug: "project-status"; data: ProjectStatusDataset }
  | { slug: "skill-gap"; data: SkillGapDataset }
  | { slug: "department-comparison"; data: DepartmentComparisonDataset }
  | { slug: "instructor-scorecard"; data: InstructorScorecardDataset };

// ── pure helpers ────────────────────────────────────────────────────────────

// Bands match v_instructor_capacity. Used by the workload report and the
// allocation histogram.
export function utilizationBand(
  pct: number | null,
): "under_utilized" | "balanced" | "at_risk" | "over_allocated" | null {
  if (pct == null) return null;
  if (pct >= 95) return "over_allocated";
  if (pct >= 80) return "at_risk";
  if (pct >= 40) return "balanced";
  return "under_utilized";
}

// "Insufficient coverage" threshold: < 2 qualified instructors is a single-
// point-of-failure risk per User Guide §12.2.
export const SKILL_COVERAGE_THRESHOLD = 2;

// "Over-coverage" heuristic: > 6 qualified instructors for a single skill
// is much more than typical hiring justifies. Tunable.
export const SKILL_OVER_COVERAGE_THRESHOLD = 6;
