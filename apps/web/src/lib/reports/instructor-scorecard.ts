import {
  utilizationBand,
  type InstructorScorecardDataset,
  type InstructorScorecardReportFilters,
} from "@arbor/shared";
import { fetchQualifiedByClass } from "./qualified";
import { scopeDept, type TypedSupabase } from "./types";

/**
 * Per-instructor scorecard: utilization, classes qualified vs assigned, skills
 * held, and certifications expiring within 90 days. "Qualified" reuses the
 * bulk qualified_instructors_for_org RPC (same source as the coverage report),
 * tallied per instructor across classes that have required skills.
 */
export async function queryInstructorScorecardReport(
  supabase: TypedSupabase,
  orgId: string,
  departmentId: string | null,
  filters: InstructorScorecardReportFilters,
): Promise<InstructorScorecardDataset> {
  const [
    { data: instructors },
    { data: capacity },
    { data: assignments },
    { data: instructorSkills },
    { data: skillReqs },
    { data: classes },
  ] = await Promise.all([
    scopeDept(
      supabase
        .from("instructors")
        .select("id, full_name, department, annual_hours")
        .eq("org_id", orgId)
        .eq("is_external", false)
        .is("deleted_at", null)
        .eq("status", "active")
        .order("full_name"),
      departmentId,
    ),
    scopeDept(
      supabase
        .from("v_instructor_capacity")
        .select("instructor_id, assigned_hours, utilization_pct")
        .eq("org_id", orgId),
      departmentId,
    ),
    scopeDept(
      supabase
        .from("class_instructor_assignments")
        .select("instructor_id, class_id, assigned_offerings")
        .eq("org_id", orgId),
      departmentId,
    ),
    scopeDept(
      supabase.from("instructor_skills").select("instructor_id, is_certified, expires_at"),
      departmentId,
    ),
    scopeDept(
      supabase
        .from("class_skill_requirements")
        .select("class_id")
        .eq("org_id", orgId)
        .eq("requirement", "required"),
      departmentId,
    ),
    scopeDept(
      supabase.from("classes").select("id").eq("org_id", orgId).is("deleted_at", null),
      departmentId,
    ),
  ]);

  const wanted = filters.instructor_ids.length > 0 ? new Set(filters.instructor_ids) : null;
  const instructorRows = (instructors ?? []).filter((i) => !wanted || wanted.has(i.id));

  const capByInstructor = new Map<string, { assigned: number; util: number | null }>();
  for (const c of capacity ?? []) {
    if (c.instructor_id == null) continue;
    capByInstructor.set(c.instructor_id, {
      assigned: c.assigned_hours ?? 0,
      util: c.utilization_pct,
    });
  }

  // Distinct assigned classes per instructor (only where they hold offerings).
  const assignedClasses = new Map<string, Set<string>>();
  for (const a of assignments ?? []) {
    if (!a.instructor_id || a.assigned_offerings <= 0) continue;
    const set = assignedClasses.get(a.instructor_id) ?? new Set<string>();
    set.add(a.class_id);
    assignedClasses.set(a.instructor_id, set);
  }

  // Skills held + expiring certs (within 90 days) per instructor.
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 90);
  const todayIso = today.toISOString().slice(0, 10);
  const horizonIso = horizon.toISOString().slice(0, 10);
  const skillsCount = new Map<string, number>();
  const expiringCount = new Map<string, number>();
  for (const isk of instructorSkills ?? []) {
    skillsCount.set(isk.instructor_id, (skillsCount.get(isk.instructor_id) ?? 0) + 1);
    if (
      isk.is_certified &&
      isk.expires_at &&
      isk.expires_at >= todayIso &&
      isk.expires_at <= horizonIso
    ) {
      expiringCount.set(isk.instructor_id, (expiringCount.get(isk.instructor_id) ?? 0) + 1);
    }
  }

  // Qualified classes per instructor: tally each instructor across the classes
  // that have required skills and that they meet.
  const classesWithReqs = new Set((skillReqs ?? []).map((r) => r.class_id));
  const qualifiedByClass = await fetchQualifiedByClass(supabase, orgId);
  const qualifiedCount = new Map<string, number>();
  for (const c of classes ?? []) {
    if (!classesWithReqs.has(c.id)) continue;
    for (const instructorId of qualifiedByClass.get(c.id) ?? []) {
      qualifiedCount.set(instructorId, (qualifiedCount.get(instructorId) ?? 0) + 1);
    }
  }

  const rows = instructorRows.map((i) => {
    const cap = capByInstructor.get(i.id);
    const util = cap?.util ?? null;
    return {
      instructor_id: i.id,
      full_name: i.full_name,
      department: i.department,
      annual_hours: i.annual_hours,
      assigned_hours: cap?.assigned ?? 0,
      utilization_pct: util,
      utilization_band: utilizationBand(util),
      classes_qualified: qualifiedCount.get(i.id) ?? 0,
      classes_assigned: assignedClasses.get(i.id)?.size ?? 0,
      skills_count: skillsCount.get(i.id) ?? 0,
      expiring_cert_count: expiringCount.get(i.id) ?? 0,
    };
  });

  return { rows };
}
