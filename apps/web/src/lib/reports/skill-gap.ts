import {
  SKILL_COVERAGE_THRESHOLD,
  SKILL_OVER_COVERAGE_THRESHOLD,
  type SkillGapDataset,
  type SkillGapReportFilters,
} from "@arbor/shared";
import type { TypedSupabase } from "./types";

// Skill Gap Analysis (User Guide §12.2):
//   - skills with < threshold qualified instructors (single-point-of-failure)
//   - certifications expiring within the filter window (default 90 days)
//   - skills with > over_threshold qualified (potential over-hiring signal)

export async function querySkillGapReport(
  supabase: TypedSupabase,
  orgId: string,
  filters: SkillGapReportFilters,
): Promise<SkillGapDataset> {
  const [{ data: skills }, { data: instructorSkills }, { data: instructors }] = await Promise.all([
    supabase
      .from("skills")
      .select("id, name, is_archived")
      .eq("org_id", orgId)
      .eq("is_archived", false),
    supabase
      .from("instructor_skills")
      .select("skill_id, instructor_id, is_certified, expires_at, certified_at"),
    supabase
      .from("instructors")
      .select("id, full_name, status, deleted_at")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active"),
  ]);

  const activeInstructorIds = new Set((instructors ?? []).map((i) => i.id));
  const instructorName = new Map((instructors ?? []).map((i) => [i.id, i.full_name]));

  // Qualified count per skill (active instructors only).
  const qualifiedBySkill = new Map<string, Set<string>>();
  for (const isk of instructorSkills ?? []) {
    if (!activeInstructorIds.has(isk.instructor_id)) continue;
    const set = qualifiedBySkill.get(isk.skill_id) ?? new Set<string>();
    set.add(isk.instructor_id);
    qualifiedBySkill.set(isk.skill_id, set);
  }

  const insufficient_coverage: SkillGapDataset["insufficient_coverage"] = [];
  const over_coverage: SkillGapDataset["over_coverage"] = [];
  for (const s of skills ?? []) {
    const count = qualifiedBySkill.get(s.id)?.size ?? 0;
    if (count < SKILL_COVERAGE_THRESHOLD) {
      insufficient_coverage.push({
        skill_id: s.id,
        skill_name: s.name,
        qualified_count: count,
        threshold: SKILL_COVERAGE_THRESHOLD,
      });
    } else if (count > SKILL_OVER_COVERAGE_THRESHOLD) {
      over_coverage.push({
        skill_id: s.id,
        skill_name: s.name,
        qualified_count: count,
      });
    }
  }
  insufficient_coverage.sort((a, b) => a.qualified_count - b.qualified_count);
  over_coverage.sort((a, b) => b.qualified_count - a.qualified_count);

  // Expiring certs within the window.
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + filters.expiry_window_days);
  const horizonIso = horizon.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const skillName = new Map((skills ?? []).map((s) => [s.id, s.name]));

  const expiring_certs: SkillGapDataset["expiring_certs"] = [];
  for (const isk of instructorSkills ?? []) {
    if (!isk.is_certified || !isk.expires_at) continue;
    if (!activeInstructorIds.has(isk.instructor_id)) continue;
    if (isk.expires_at < todayIso || isk.expires_at > horizonIso) continue;
    const days = Math.ceil(
      (new Date(isk.expires_at + "T00:00:00Z").getTime() - today.getTime()) / 86400000,
    );
    expiring_certs.push({
      instructor_id: isk.instructor_id,
      instructor_name: instructorName.get(isk.instructor_id) ?? "Unknown",
      skill_id: isk.skill_id,
      skill_name: skillName.get(isk.skill_id) ?? "Unknown",
      expires_at: isk.expires_at,
      days_remaining: days,
    });
  }
  expiring_certs.sort((a, b) => a.days_remaining - b.days_remaining);

  return { insufficient_coverage, expiring_certs, over_coverage };
}
