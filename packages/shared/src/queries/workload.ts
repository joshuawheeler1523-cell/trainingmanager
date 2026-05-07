// Pure workload math + types. The actual Supabase query wrappers live in
// apps/web/src/lib/queries/workload.ts where they have access to the Database
// type. Keeping the helpers pure here means they can run in tests without
// any Supabase mocks.

import type { Frequency } from "../schemas/task";

// Inlined per-frequency annual occurrences. Mirrors FREQUENCY_TO_ANNUAL in
// schemas/task.ts and the SQL frequency_to_annual() helper. Inlined here so
// this file has no runtime dependency on the schema module — keeps it lean
// for tree-shaking and avoids cross-package type-resolution issues.
const DAILY = 250;
const WEEKLY = 52;
const BIWEEKLY = 26;
const MONTHLY = 12;
const QUARTERLY = 4;
const ANNUALLY = 1;

export type WorkloadSource = "class" | "recurring_task" | "ad_hoc_task";

export type WorkloadRow = {
  org_id: string;
  instructor_id: string;
  source: WorkloadSource;
  source_id: string;
  source_label: string;
  quantity: number | null;
  annual_hours: number;
  bucket_id: string | null;
};

export type CapacityRow = {
  org_id: string;
  instructor_id: string;
  full_name: string;
  annual_hours: number;
  assigned_hours: number;
  utilization_pct: number | null;
  utilization_status: "over_allocated" | "at_risk" | "balanced" | "under_utilized";
};

export type ForecastWeek = {
  week_start: string; // ISO date
  projected_hours: number;
  weekly_capacity: number;
  utilization_pct: number | null;
};

// Group a flat list of workload rows by source. Useful for breakdown panels.
export function groupWorkloadBySource(rows: WorkloadRow[]): Record<WorkloadSource, WorkloadRow[]> {
  const out: Record<WorkloadSource, WorkloadRow[]> = {
    class: [],
    recurring_task: [],
    ad_hoc_task: [],
  };
  for (const r of rows) {
    out[r.source].push(r);
  }
  return out;
}

export function totalAnnualHours(rows: WorkloadRow[]): number {
  return rows.reduce((acc, r) => acc + (r.annual_hours || 0), 0);
}

// ── Pure forecast distribution helpers (parallel to the SQL) ────────────────

// Per-week class hours: annual hours spread evenly across 52 weeks.
export function classHoursPerWeek(annualHours: number): number {
  return annualHours / 52;
}

// Per-week recurring hours: hours_per_occurrence × occurrences_per_week,
// where occurrences_per_week = effective_occurrences_per_year / 52.
// share_percent (0–100) splits the task's total across assignees.
function defaultOccurrencesPerYear(frequency: Frequency): number {
  switch (frequency) {
    case "daily":
      return DAILY;
    case "weekly":
      return WEEKLY;
    case "biweekly":
      return BIWEEKLY;
    case "monthly":
      return MONTHLY;
    case "quarterly":
      return QUARTERLY;
    case "annually":
      return ANNUALLY;
  }
}

export function recurringHoursPerWeek(args: {
  frequency: Frequency;
  occurrences_per_year: number | null;
  hours_per_occurrence: number;
  share_percent?: number;
}): number {
  const occ = args.occurrences_per_year ?? defaultOccurrencesPerYear(args.frequency);
  const share = args.share_percent ?? 100;
  return (args.hours_per_occurrence * occ * (share / 100)) / 52;
}

// Whether a date falls in the same ISO week (Mon-anchored) as the given
// week_start. Returns 0 if the dates aren't in the same week, or `hours`
// if they are. Used to place ad-hoc tasks on the timeline.
export function adHocHoursForWeek(args: {
  due_date: string | null;
  hours: number;
  week_start: string;
}): number {
  if (!args.due_date) return 0;
  const due = new Date(args.due_date + "T00:00:00Z");
  const wk = new Date(args.week_start + "T00:00:00Z");
  // Use Mon-anchored week-of-year, mirroring date_trunc('week', ...) in PG.
  const dayOfWeek = (due.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  const dueMonday = new Date(due);
  dueMonday.setUTCDate(due.getUTCDate() - dayOfWeek);
  return dueMonday.toISOString().slice(0, 10) === wk.toISOString().slice(0, 10) ? args.hours : 0;
}

export function weeklyCapacity(annualHours: number): number {
  return annualHours / 52;
}

// ── Bucket breakdown (for donut charts) ─────────────────────────────────────

export type BucketSlice = {
  bucket_id: string | null;
  bucket_label: string;
  bucket_color: string;
  hours: number;
  percent: number; // 0-100
};

// Aggregates workload rows by bucket_id and returns slices sorted descending
// by hours. Rows with no bucket_id are bundled under "Unbucketed" (gray).
// The lookup map provides a label + color per bucket; missing bucket ids
// fall back to the bucket id as label and a neutral gray.
export function bucketBreakdown(
  rows: WorkloadRow[],
  buckets: { id: string; name: string; color: string }[],
): BucketSlice[] {
  const byBucket = new Map<string | null, number>();
  for (const r of rows) {
    const key = r.bucket_id;
    byBucket.set(key, (byBucket.get(key) ?? 0) + (r.annual_hours || 0));
  }

  const total = Array.from(byBucket.values()).reduce((a, b) => a + b, 0);
  const lookup = new Map(buckets.map((b) => [b.id, b]));

  const slices: BucketSlice[] = Array.from(byBucket.entries()).map(([id, hours]) => {
    const meta = id ? lookup.get(id) : null;
    return {
      bucket_id: id,
      bucket_label: meta?.name ?? (id == null ? "Unbucketed" : id),
      bucket_color: meta?.color ?? "#94a3b8",
      hours,
      percent: total > 0 ? (hours / total) * 100 : 0,
    };
  });

  return slices.sort((a, b) => b.hours - a.hours);
}

// Compares the per-week forecast against each row's weekly_capacity and
// returns a tier per week. Used by the forecast bar chart to color bars.
export type ForecastTier = "ok" | "near" | "over";
export function forecastTier(week: ForecastWeek): ForecastTier {
  if (week.utilization_pct == null) return "ok";
  if (week.utilization_pct >= 95) return "over";
  if (week.utilization_pct >= 80) return "near";
  return "ok";
}

// "Projected" annualized: sum of weekly projected hours across the forecast
// window, scaled to a full year by 52 / weeks. Lets us compare a short-window
// forecast to the annualized assigned_hours.
export function projectedAnnualized(weeks: ForecastWeek[]): number {
  if (weeks.length === 0) return 0;
  const sum = weeks.reduce((acc, w) => acc + (w.projected_hours || 0), 0);
  return (sum * 52) / weeks.length;
}
