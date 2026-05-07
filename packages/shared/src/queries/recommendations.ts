// Rule-based smart recommendations for v1. No LLM here — pure data-driven
// flags. The expected inputs are already-fetched rows (not Supabase clients);
// the caller does the queries and feeds the helpers.

// Minimal structural type covering the CapacityRow shape used by these rules.
// Inlined (rather than imported from ./workload) so the cross-package eslint
// config can resolve types without project-references plumbing — same pattern
// used in workload.ts.
export type CapacityRowForRecs = {
  instructor_id: string;
  full_name: string;
  annual_hours: number;
  assigned_hours: number;
  utilization_pct: number | null;
};

export type RecommendationKind =
  | "instructor_over_allocated"
  | "class_single_qualified"
  | "bucket_over_consumed";

export type Recommendation = {
  id: string; // stable client-side key
  kind: RecommendationKind;
  severity: "warning" | "critical";
  title: string;
  body: string;
  // Optional deep-link to the relevant detail page. Callers render an
  // <a href> if present.
  link?: string;
};

// ── Rule 1 ──────────────────────────────────────────────────────────────────
// "Instructor X is at 95%+ utilization; consider redistributing Y hours."
// Threshold: utilization_pct >= 95.

export function recommendOverAllocatedInstructors(rows: CapacityRowForRecs[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of rows) {
    if (r.utilization_pct == null) continue;
    if (r.utilization_pct < 95) continue;
    const overBy = Math.max(0, Math.round(r.assigned_hours - r.annual_hours));
    out.push({
      id: `inst-over-${r.instructor_id}`,
      kind: "instructor_over_allocated",
      severity: r.utilization_pct >= 100 ? "critical" : "warning",
      title: `${r.full_name} is at ${r.utilization_pct.toFixed(0)}% utilization`,
      body:
        overBy > 0
          ? `Consider redistributing ~${overBy.toString()} hours to a less-loaded instructor.`
          : "Workload is at the cap; consider redistributing some hours before adding more.",
      link: `/instructors/${r.instructor_id}`,
    });
  }
  // Most-utilized first
  out.sort((a, b) => {
    const ar = rows.find((r) => `inst-over-${r.instructor_id}` === a.id);
    const br = rows.find((r) => `inst-over-${r.instructor_id}` === b.id);
    return (br?.utilization_pct ?? 0) - (ar?.utilization_pct ?? 0);
  });
  return out;
}

// ── Rule 2 ──────────────────────────────────────────────────────────────────
// "Class Z has a single qualified instructor; recommend cross-training W."
// Input: rows describing class skill-coverage. The caller supplies one row
// per class with the qualified instructor count from
// qualified_instructors_for_class().

export type ClassCoverageInput = {
  class_id: string;
  class_name: string;
  qualified_count: number;
};

export function recommendUndercoveredClasses(rows: ClassCoverageInput[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of rows) {
    if (r.qualified_count > 1) continue;
    const isZero = r.qualified_count === 0;
    out.push({
      id: `class-cov-${r.class_id}`,
      kind: "class_single_qualified",
      severity: isZero ? "critical" : "warning",
      title: isZero
        ? `${r.class_name} has no qualified instructors`
        : `${r.class_name} has only one qualified instructor`,
      body: isZero
        ? "No active instructor meets all required skills. Either add a qualified instructor or relax a requirement."
        : "If that one person is unavailable, the class can't run. Consider cross-training another instructor.",
      link: `/classes/${r.class_id}`,
    });
  }
  return out;
}

// ── Rule 3 ──────────────────────────────────────────────────────────────────
// "Bucket A is at 110% of allocation; review recent additions."
// Input: bucket consumption rows + the org's allocation slate (target % per
// bucket) + the org's total annual capacity (sum of active instructors'
// annual_hours). The bucket's target hours = (target_percent / 100) * total
// org capacity. If consumed_hours / target_hours >= 1.10 → flag.

export type BucketConsumptionInput = {
  bucket_id: string;
  bucket_name: string;
  target_percent: number; // 0-100 from global_allocations
  consumed_hours: number; // from v_bucket_consumption
};

export function recommendOverConsumedBuckets(
  rows: BucketConsumptionInput[],
  totalOrgAnnualHours: number,
): Recommendation[] {
  const out: Recommendation[] = [];
  if (totalOrgAnnualHours <= 0) return out;
  for (const r of rows) {
    if (r.target_percent <= 0) continue;
    const targetHours = (r.target_percent / 100) * totalOrgAnnualHours;
    if (targetHours <= 0) continue;
    const ratio = r.consumed_hours / targetHours;
    if (ratio < 1.1) continue;
    const overPct = Math.round((ratio - 1) * 100);
    out.push({
      id: `bucket-over-${r.bucket_id}`,
      kind: "bucket_over_consumed",
      severity: ratio >= 1.25 ? "critical" : "warning",
      title: `${r.bucket_name} is at ${String(Math.round(ratio * 100))}% of allocation`,
      body: `Bucket consumption (${r.consumed_hours.toFixed(0)}h) exceeds the org-wide target (${targetHours.toFixed(0)}h) by ${overPct.toString()}%. Review recent additions.`,
      link: `/allocations`,
    });
  }
  return out;
}

// Convenience: run all rules and return a flat list ordered by severity then
// kind. Caller can group as needed.
export function buildRecommendations(input: {
  capacity: CapacityRowForRecs[];
  classCoverage: ClassCoverageInput[];
  bucketConsumption: BucketConsumptionInput[];
  totalOrgAnnualHours: number;
}): Recommendation[] {
  const all: Recommendation[] = [
    ...recommendOverAllocatedInstructors(input.capacity),
    ...recommendUndercoveredClasses(input.classCoverage),
    ...recommendOverConsumedBuckets(input.bucketConsumption, input.totalOrgAnnualHours),
  ];
  const sevRank: Record<Recommendation["severity"], number> = {
    critical: 0,
    warning: 1,
  };
  return all.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}
