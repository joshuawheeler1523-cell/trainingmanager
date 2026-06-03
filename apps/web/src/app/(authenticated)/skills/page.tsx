import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import SkillsView, {
  type ClassGap,
  type CoverageCount,
  type ExpiringCert,
  type MatrixData,
} from "./skills-view";
import type { Skill, Proficiency } from "@arbor/shared";

export default async function SkillsPage() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Skills" description="Skill library, certifications, and gap analysis." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  // Date window for the expiring-certs query (next 90 days).
  const today = new Date();
  const ninetyDays = new Date(today);
  ninetyDays.setDate(ninetyDays.getDate() + 90);
  const todayStr = today.toISOString().slice(0, 10);
  const ninetyStr = ninetyDays.toISOString().slice(0, 10);

  // All six page queries are independent of each other's results — fan out
  // in parallel instead of awaiting them sequentially.
  const [
    { data: skillsData },
    { data: instructorSkillRows },
    { data: classesWithReqsRaw },
    { data: qualifiedPairs },
    { data: matrixInstructorsRaw },
    { data: expiringRaw },
  ] = await Promise.all([
    applyDeptScope(supabase.from("skills").select("*").eq("org_id", orgId).order("name"), scope),
    applyDeptScope(
      supabase
        .from("instructor_skills")
        .select("skill_id, proficiency, instructor_id, instructors!inner(deleted_at,status,org_id)")
        .eq("org_id", orgId),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("classes")
        .select("id,name,class_skill_requirements!inner(requirement)")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .eq("class_skill_requirements.requirement", "required"),
      scope,
    ),
    supabase.rpc("qualified_instructors_for_org", { p_org_id: orgId }),
    applyDeptScope(
      supabase
        .from("instructors")
        .select("id, full_name")
        .eq("org_id", orgId)
        .eq("status", "active")
        .eq("is_external", false)
        .is("deleted_at", null)
        .order("full_name"),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("instructor_skills")
        .select(
          "id,instructor_id,skill_id,expires_at,instructors!inner(full_name),skills!inner(name)",
        )
        .eq("org_id", orgId)
        .eq("is_certified", true)
        .not("expires_at", "is", null)
        .gte("expires_at", todayStr)
        .lte("expires_at", ninetyStr)
        .order("expires_at"),
      scope,
    ),
  ]);

  const skills = (skillsData ?? []) as Skill[];

  // ── Coverage: counts per (skill_id, proficiency) ───────────────────────────
  const coverageMap = new Map<string, number>();
  const skillsWithAnyInstructor = new Set<string>();
  for (const row of instructorSkillRows ?? []) {
    const isk = row as unknown as {
      skill_id: string;
      proficiency: Proficiency;
      instructor_id: string;
      instructors: { deleted_at: string | null; status: string };
    };
    if (isk.instructors.deleted_at !== null) continue;
    if (isk.instructors.status !== "active") continue;
    skillsWithAnyInstructor.add(isk.skill_id);
    const key = `${isk.skill_id}::${isk.proficiency}`;
    coverageMap.set(key, (coverageMap.get(key) ?? 0) + 1);
  }
  const coverage: CoverageCount[] = Array.from(coverageMap.entries()).map(([key, count]) => {
    const [skill_id, proficiency] = key.split("::") as [string, Proficiency];
    return { skill_id, proficiency, count };
  });

  // ── Gap A: Classes lacking enough qualified instructors ────────────────────
  const seenClassIds = new Set<string>();
  const candidateClasses: { id: string; name: string; required_count: number }[] = [];
  for (const row of classesWithReqsRaw ?? []) {
    if (seenClassIds.has(row.id)) continue;
    seenClassIds.add(row.id);
    candidateClasses.push({
      id: row.id,
      name: row.name,
      required_count: row.class_skill_requirements.length,
    });
  }

  // Bulk RPC returns (class_id, instructor_id) for every qualified
  // pair in the org. Replaces an N+1 (one RPC per class) — same data
  // in a single round-trip.
  const classGaps: ClassGap[] = [];
  const qualifiedByClass = new Map<string, Set<string>>();
  for (const pair of qualifiedPairs ?? []) {
    const set = qualifiedByClass.get(pair.class_id) ?? new Set<string>();
    set.add(pair.instructor_id);
    qualifiedByClass.set(pair.class_id, set);
  }
  for (const c of candidateClasses) {
    const ids = qualifiedByClass.get(c.id) ?? new Set<string>();
    if (!qualifiedByClass.has(c.id)) qualifiedByClass.set(c.id, ids);
    if (ids.size === 0) {
      classGaps.push({
        class_id: c.id,
        class_name: c.name,
        required_count: c.required_count,
        qualified_count: 0,
      });
    }
  }

  // Matrix data — every active non-external instructor × every class with at
  // least one required skill. Cell is true when the instructor is in the
  // qualified set for that class.
  const matrix: MatrixData = {
    instructors: (matrixInstructorsRaw ?? []).map((i) => ({ id: i.id, name: i.full_name })),
    classes: candidateClasses.map((c) => ({
      id: c.id,
      name: c.name,
      requiredSkillCount: c.required_count,
    })),
    qualifiedByClass: Object.fromEntries(
      [...qualifiedByClass.entries()].map(([cid, set]) => [cid, [...set]]),
    ),
  };

  // ── Gap B: Skills with zero qualified instructors ──────────────────────────
  const uncoveredSkillIds = skills
    .filter((s) => !s.is_archived && !skillsWithAnyInstructor.has(s.id))
    .map((s) => s.id);

  // ── Gap C: Expiring certifications (next 90 days) ──────────────────────────

  // The query already filters .not("expires_at", "is", null), so the value
  // is always present at runtime; narrow the type with a guard so we don't
  // lean on a non-null assertion.
  const expiringCerts: ExpiringCert[] = (expiringRaw ?? [])
    .filter((row): row is typeof row & { expires_at: string } => row.expires_at !== null)
    .map((row) => {
      const days = Math.max(
        0,
        Math.ceil((new Date(row.expires_at).getTime() - today.getTime()) / 86400000),
      );
      return {
        instructor_skill_id: row.id,
        instructor_id: row.instructor_id,
        instructor_name: row.instructors.full_name,
        skill_id: row.skill_id,
        skill_name: row.skills.name,
        expires_at: row.expires_at,
        days_until: days,
      };
    });

  return (
    <div>
      <PageHeader title="Skills" description="Skill library, certifications, and gap analysis." />
      <SkillsView
        skills={skills}
        coverage={coverage}
        classGaps={classGaps}
        uncoveredSkillIds={uncoveredSkillIds}
        expiringCerts={expiringCerts}
        matrix={matrix}
      />
    </div>
  );
}
