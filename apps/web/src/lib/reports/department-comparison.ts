import type { DepartmentComparisonDataset } from "@arbor/shared";
import type { TypedSupabase } from "./types";

/**
 * Per-department capacity rollup: headcount, annual vs assigned hours, average
 * utilization, active projects, and open work intake. Mirrors the dashboard's
 * department rollup but packaged as a report (preview + PDF/Excel/CSV export).
 * It's a current-state snapshot, so it ignores the (validated) date filters.
 */
export async function queryDepartmentComparisonReport(
  supabase: TypedSupabase,
  orgId: string,
): Promise<DepartmentComparisonDataset> {
  const [
    { data: departments },
    { data: instructors },
    { data: capacity },
    { data: projects },
    { data: tras },
  ] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", orgId).order("name"),
    supabase
      .from("instructors")
      .select("id, department_id, annual_hours")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase
      .from("v_instructor_capacity")
      .select("instructor_id, assigned_hours, utilization_pct")
      .eq("org_id", orgId),
    supabase
      .from("projects")
      .select("department_id, status")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .in("status", ["planning", "active"]),
    supabase
      .from("tras")
      .select("department_id, status")
      .eq("org_id", orgId)
      .in("status", ["submitted", "approved"]),
  ]);

  const capByInstructor = new Map<string, { assigned: number; util: number | null }>();
  for (const c of capacity ?? []) {
    if (c.instructor_id == null) continue;
    capByInstructor.set(c.instructor_id, {
      assigned: c.assigned_hours ?? 0,
      util: c.utilization_pct,
    });
  }

  const projectsByDept = new Map<string, number>();
  for (const p of projects ?? []) {
    if (p.department_id) {
      projectsByDept.set(p.department_id, (projectsByDept.get(p.department_id) ?? 0) + 1);
    }
  }
  const intakeByDept = new Map<string, number>();
  for (const t of tras ?? []) {
    if (t.department_id) {
      intakeByDept.set(t.department_id, (intakeByDept.get(t.department_id) ?? 0) + 1);
    }
  }

  const rows = (departments ?? []).map((d) => {
    const deptInstructors = (instructors ?? []).filter((i) => i.department_id === d.id);
    const totalAnnual = deptInstructors.reduce((s, i) => s + i.annual_hours, 0);
    let totalAssigned = 0;
    const utils: number[] = [];
    for (const i of deptInstructors) {
      const cap = capByInstructor.get(i.id);
      if (cap) {
        totalAssigned += cap.assigned;
        if (cap.util != null) utils.push(cap.util);
      }
    }
    const avgUtil = utils.length > 0 ? utils.reduce((s, u) => s + u, 0) / utils.length : null;
    return {
      department_id: d.id,
      department_name: d.name,
      instructor_count: deptInstructors.length,
      total_annual_hours: totalAnnual,
      total_assigned_hours: totalAssigned,
      avg_utilization_pct: avgUtil,
      active_project_count: projectsByDept.get(d.id) ?? 0,
      open_intake_count: intakeByDept.get(d.id) ?? 0,
    };
  });

  const totalAnnual = rows.reduce((s, r) => s + r.total_annual_hours, 0);
  const totalAssigned = rows.reduce((s, r) => s + r.total_assigned_hours, 0);
  const totals = {
    instructor_count: rows.reduce((s, r) => s + r.instructor_count, 0),
    total_annual_hours: totalAnnual,
    total_assigned_hours: totalAssigned,
    // Org-wide utilization is assigned / available, not an average of per-dept
    // averages (which would over-weight small departments).
    avg_utilization_pct: totalAnnual > 0 ? (totalAssigned / totalAnnual) * 100 : null,
    active_project_count: rows.reduce((s, r) => s + r.active_project_count, 0),
    open_intake_count: rows.reduce((s, r) => s + r.open_intake_count, 0),
  };

  return { rows, totals };
}
