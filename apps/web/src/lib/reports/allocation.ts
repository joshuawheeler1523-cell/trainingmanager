import {
  utilizationBand,
  type AllocationDataset,
  type AllocationReportFilters,
  type WorkloadRow,
} from "@arbor/shared";
import type { TypedSupabase } from "./types";

// Resource Allocation Summary (User Guide §12.2):
//   - hours by bucket vs target % (from global_allocations)
//   - utilization histogram across active instructors
//   - high-priority %: portion of hours on project_task rows whose project
//     priority is high/critical (the most reliable proxy for "important")
//   - unallocated capacity: sum across active instructors of
//     (annual_hours - assigned_hours)

export async function queryAllocationReport(
  supabase: TypedSupabase,
  orgId: string,
  filters: AllocationReportFilters,
): Promise<AllocationDataset> {
  const [
    { data: workload },
    { data: capacity },
    { data: buckets },
    { data: globalAllocations },
    { data: instructors },
    { data: projectTasks },
    { data: projects },
  ] = await Promise.all([
    supabase.from("v_instructor_workload").select("*").eq("org_id", orgId),
    supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId),
    supabase.from("allocation_buckets").select("id, name").eq("org_id", orgId),
    supabase.from("global_allocations").select("bucket_id, target_percent").eq("org_id", orgId),
    supabase
      .from("instructors")
      .select("id, full_name, annual_hours, status, deleted_at")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase
      .from("task_assignments")
      .select("allocated_hours, task_id, project_team_member_id")
      .eq("org_id", orgId),
    supabase
      .from("projects")
      .select("id, priority, status")
      .eq("org_id", orgId)
      .is("deleted_at", null),
  ]);

  const bucketList = (buckets ?? []) as { id: string; name: string }[];
  const targetByBucket = new Map<string, number>();
  for (const g of (globalAllocations ?? []) as { bucket_id: string; target_percent: number }[]) {
    targetByBucket.set(g.bucket_id, g.target_percent);
  }

  // Bucket-level rollup. Filter by bucket_ids if supplied.
  const allowedBuckets = filters.bucket_ids.length > 0 ? new Set(filters.bucket_ids) : null;
  const workloadRows = (workload ?? []) as unknown as WorkloadRow[];
  const totalHours = workloadRows.reduce((acc, r) => acc + (r.annual_hours || 0), 0);

  // Per-bucket totals + per-bucket per-instructor totals (for "top consumers").
  const bucketTotals = new Map<string | null, number>();
  const perBucketPerInstructor = new Map<string | null, Map<string, number>>();
  for (const r of workloadRows) {
    bucketTotals.set(r.bucket_id, (bucketTotals.get(r.bucket_id) ?? 0) + (r.annual_hours || 0));
    const inner = perBucketPerInstructor.get(r.bucket_id) ?? new Map<string, number>();
    inner.set(r.instructor_id, (inner.get(r.instructor_id) ?? 0) + (r.annual_hours || 0));
    perBucketPerInstructor.set(r.bucket_id, inner);
  }

  const instructorMap = new Map((instructors ?? []).map((i) => [i.id, i.full_name]));

  const bucketsOut: AllocationDataset["buckets"] = bucketList
    .filter((b) => (allowedBuckets ? allowedBuckets.has(b.id) : true))
    .map((b) => {
      const actualHours = bucketTotals.get(b.id) ?? 0;
      const actualPercent = totalHours > 0 ? (actualHours / totalHours) * 100 : 0;
      const targetPercent = targetByBucket.get(b.id) ?? 0;
      const inner = perBucketPerInstructor.get(b.id) ?? new Map<string, number>();
      const top: { instructor_id: string; instructor_name: string; hours: number }[] = Array.from(
        inner.entries(),
      )
        .sort((a, b2) => b2[1] - a[1])
        .slice(0, 3)
        .map(([instructor_id, hours]) => ({
          instructor_id,
          instructor_name: instructorMap.get(instructor_id) ?? "Unknown",
          hours,
        }));
      return {
        bucket_id: b.id,
        bucket_name: b.name,
        target_percent: targetPercent,
        actual_hours: actualHours,
        actual_percent: actualPercent,
        variance_percent: actualPercent - targetPercent,
        top_consumers: top,
      };
    });

  // Add an "Unbucketed" row covering null-bucket workload (recurring tasks
  // sometimes have null bucket_id; ad-hoc and education_request always do).
  const unbucketedHours = bucketTotals.get(null) ?? 0;
  if (unbucketedHours > 0 && !allowedBuckets) {
    bucketsOut.push({
      bucket_id: null,
      bucket_name: "Unbucketed",
      target_percent: 0,
      actual_hours: unbucketedHours,
      actual_percent: totalHours > 0 ? (unbucketedHours / totalHours) * 100 : 0,
      variance_percent: 0,
      top_consumers: [],
    });
  }

  // Histogram across active instructors
  const histogramCounts = {
    under_utilized: 0,
    balanced: 0,
    at_risk: 0,
    over_allocated: 0,
  };
  for (const c of capacity ?? []) {
    const band = utilizationBand(c.utilization_pct);
    if (band) histogramCounts[band]++;
  }
  const utilization_histogram = (
    ["under_utilized", "balanced", "at_risk", "over_allocated"] as const
  ).map((band) => ({ band, count: histogramCounts[band] }));

  // High-priority %: hours allocated to project_task whose project is high/critical
  const projectPriority = new Map((projects ?? []).map((p) => [p.id, p.priority]));
  // The task_assignments table doesn't directly tell us which project a task
  // belongs to; we need that join. Fetch tasks separately rather than nesting
  // here to keep the SQL surface obvious.
  const taskIds = Array.from(new Set((projectTasks ?? []).map((t) => t.task_id)));
  const { data: taskRows } =
    taskIds.length > 0
      ? await supabase.from("tasks").select("id, project_id").in("id", taskIds)
      : { data: [] as { id: string; project_id: string }[] };
  const taskToProject = new Map((taskRows ?? []).map((t) => [t.id, t.project_id]));

  let highPriorityHours = 0;
  let projectTaskTotal = 0;
  for (const a of projectTasks ?? []) {
    projectTaskTotal += a.allocated_hours;
    const projectId = taskToProject.get(a.task_id);
    if (!projectId) continue;
    const pri = projectPriority.get(projectId);
    if (pri === "high" || pri === "critical") highPriorityHours += a.allocated_hours;
  }
  const highPriorityPercent =
    projectTaskTotal > 0 ? (highPriorityHours / projectTaskTotal) * 100 : 0;

  // Unallocated capacity: per-instructor (annual - assigned), summed.
  const assignedByInstructor = new Map<string, number>();
  for (const c of capacity ?? []) {
    if (c.instructor_id != null && c.assigned_hours != null) {
      assignedByInstructor.set(c.instructor_id, c.assigned_hours);
    }
  }
  let unallocated = 0;
  for (const i of instructors ?? []) {
    const assigned = assignedByInstructor.get(i.id) ?? 0;
    unallocated += Math.max(0, i.annual_hours - assigned);
  }

  return {
    period: { start: filters.start_date, end: filters.end_date },
    buckets: bucketsOut,
    utilization_histogram,
    high_priority_percent: highPriorityPercent,
    unallocated_hours: unallocated,
    total_hours: totalHours,
  };
}
