import {
  utilizationBand,
  type InstructorScorecardDataset,
  type InstructorScorecardReportFilters,
} from "@arbor/shared";
import type { TypedSupabase } from "./types";

/**
 * Per-instructor scorecard: utilization, classes qualified vs assigned, skills
 * held, and certifications expiring within 90 days. "Qualified" reuses the
 * qualified_instructors_for_class RPC (same source as the coverage report),
 * tallied per instructor across classes that have required skills.
 */
export async function queryInstructorScorecardReport(
  supabase: TypedSupabase,
  orgId: string,
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
    supabase
      .from("instructors")
      .select("id, full_name, department, annual_hours")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("v_instructor_capacity")
      .select("instructor_id, assigned_hours, utilization_pct")
      .eq("org_id", orgId),
    supabase
      .from("class_instructor_assignments")
      .select("instructor_id, class_id, assigned_offerings")
      .eq("org_id", orgId),
    supabase.from("instructor_skills").select("instructor_id, is_certified, expires_at"),
    supabase
      .from("class_skill_requirements")
      .select("class_id")
      .eq("org_id", orgId)
      .eq("requirement", "required"),
    supabase.from("classes").select("id").eq("org_id", orgId).is("deleted_at", null),
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

  // Qualified classes per instructor: for each class with required skills, the
  // RPC returns the instructors who meet them; tally each.
  const classesWithReqs = new Set((skillReqs ?? []).map((r) => r.class_id));
  const qualifiedCount = new Map<string, number>();
  await Promise.all(
    (classes ?? [])
      .filter((c) => classesWithReqs.has(c.id))
      .map(async (c) => {
        const { data } = await supabase.rpc("qualified_instructors_for_class", {
          p_class_id: c.id,
        });
        for (const row of (data ?? []) as { id?: string; instructor_id?: string }[]) {
          const id = row.instructor_id ?? row.id;
          if (id) qualifiedCount.set(id, (qualifiedCount.get(id) ?? 0) + 1);
        }
      }),
  );

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
