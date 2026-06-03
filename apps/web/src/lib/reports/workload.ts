import {
  utilizationBand,
  type WorkloadDataset,
  type WorkloadReportFilters,
  type WorkloadRow,
} from "@arbor/shared";
import { scopeDept, type TypedSupabase } from "./types";

// Instructor Workload Report (User Guide §12.2): per-instructor 6-source
// breakdown + utilization band. The 6 sources are:
//   class, recurring_task, ad_hoc_task, education_request, project_task,
//   training-planner sessions (also surfaced as project_task in the view).
// We treat the union as 5 named buckets here since 'project_task' covers
// both Special Projects and Training Planner per Phase 7.2's view extension.

export async function queryWorkloadReport(
  supabase: TypedSupabase,
  orgId: string,
  departmentId: string | null,
  filters: WorkloadReportFilters,
): Promise<WorkloadDataset> {
  const [{ data: instructors }, { data: capacity }, { data: workload }] = await Promise.all([
    scopeDept(
      supabase
        .from("instructors")
        .select("id, full_name, annual_hours, status, deleted_at")
        .eq("org_id", orgId)
        .eq("is_external", false)
        .is("deleted_at", null)
        .eq("status", "active"),
      departmentId,
    ),
    scopeDept(supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId), departmentId),
    scopeDept(supabase.from("v_instructor_workload").select("*").eq("org_id", orgId), departmentId),
  ]);

  const allowedIds = filters.instructor_ids.length > 0 ? new Set(filters.instructor_ids) : null;

  const capacityByInstructor = new Map(
    (capacity ?? []).map(
      (c) =>
        [
          c.instructor_id ?? "",
          {
            assigned_hours: c.assigned_hours ?? 0,
            utilization_pct: c.utilization_pct,
          },
        ] as const,
    ),
  );

  const sourcesByInstructor = new Map<string, WorkloadDataset["rows"][number]["sources"]>();
  for (const r of (workload ?? []) as unknown as WorkloadRow[]) {
    const cur = sourcesByInstructor.get(r.instructor_id) ?? {
      class: 0,
      recurring_task: 0,
      ad_hoc_task: 0,
      education_request: 0,
      project_task: 0,
    };
    cur[r.source] += r.annual_hours || 0;
    sourcesByInstructor.set(r.instructor_id, cur);
  }

  const rows: WorkloadDataset["rows"] = [];
  for (const i of instructors ?? []) {
    if (allowedIds && !allowedIds.has(i.id)) continue;
    const cap = capacityByInstructor.get(i.id);
    const band = utilizationBand(cap?.utilization_pct ?? null);
    if (filters.utilization_band !== "all" && band !== filters.utilization_band) continue;
    rows.push({
      instructor_id: i.id,
      full_name: i.full_name,
      annual_hours: i.annual_hours,
      assigned_hours: cap?.assigned_hours ?? 0,
      utilization_pct: cap?.utilization_pct ?? null,
      utilization_band: band,
      sources: sourcesByInstructor.get(i.id) ?? {
        class: 0,
        recurring_task: 0,
        ad_hoc_task: 0,
        education_request: 0,
        project_task: 0,
      },
    });
  }

  // Sort: most utilized first, then alpha by name.
  rows.sort((a, b) => {
    const ap = a.utilization_pct ?? -1;
    const bp = b.utilization_pct ?? -1;
    if (ap !== bp) return bp - ap;
    return a.full_name.localeCompare(b.full_name);
  });

  return { rows };
}
