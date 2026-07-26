import type { CoverageDataset, CoverageReportFilters } from "@arbor/shared";
import { fetchQualifiedByClass } from "./qualified";
import { scopeDept, type TypedSupabase } from "./types";

// Class Coverage Report (User Guide §12.2):
//   - assigned offerings vs offerings_per_year
//   - count of qualified instructors (via the bulk
//     qualified_instructors_for_org RPC)
//   - flag rows with no assignee or with a skill gap (no qualified instructor)

export async function queryCoverageReport(
  supabase: TypedSupabase,
  orgId: string,
  departmentId: string | null,
  filters: CoverageReportFilters,
): Promise<CoverageDataset> {
  const [{ data: classes }, { data: assignments }, { data: buckets }] = await Promise.all([
    scopeDept(
      supabase
        .from("classes")
        .select("id, name, offerings_per_year, allocation_bucket_id")
        .eq("org_id", orgId)
        .is("deleted_at", null),
      departmentId,
    ),
    scopeDept(
      supabase.from("class_instructor_assignments").select("class_id, assigned_offerings"),
      departmentId,
    ),
    scopeDept(
      supabase.from("allocation_buckets").select("id, name").eq("org_id", orgId),
      departmentId,
    ),
  ]);

  const allowedBuckets = filters.bucket_ids.length > 0 ? new Set(filters.bucket_ids) : null;
  const bucketName = new Map<string, string>((buckets ?? []).map((b) => [b.id, b.name]));

  // Sum assigned_offerings per class.
  const assignedByClass = new Map<string, number>();
  const assigneeCount = new Map<string, number>();
  for (const a of assignments ?? []) {
    assignedByClass.set(
      a.class_id,
      (assignedByClass.get(a.class_id) ?? 0) + (a.assigned_offerings || 0),
    );
    if (a.assigned_offerings > 0) {
      assigneeCount.set(a.class_id, (assigneeCount.get(a.class_id) ?? 0) + 1);
    }
  }

  // Classes with no required skills are excluded from the qualified count —
  // every active instructor trivially "qualifies" for those, which isn't what
  // the column means.
  const [{ data: skillReqs }, qualifiedByClass] = await Promise.all([
    scopeDept(
      supabase
        .from("class_skill_requirements")
        .select("class_id")
        .eq("org_id", orgId)
        .eq("requirement", "required"),
      departmentId,
    ),
    fetchQualifiedByClass(supabase, orgId),
  ]);
  const classesWithRequiredSkills = new Set((skillReqs ?? []).map((r) => r.class_id));

  const qualifiedCounts = new Map<string, number>();
  for (const c of classes ?? []) {
    if (!classesWithRequiredSkills.has(c.id)) continue;
    qualifiedCounts.set(c.id, qualifiedByClass.get(c.id)?.length ?? 0);
  }

  const rows: CoverageDataset["rows"] = [];
  for (const c of classes ?? []) {
    if (allowedBuckets && !(c.allocation_bucket_id && allowedBuckets.has(c.allocation_bucket_id))) {
      continue;
    }
    const target = c.offerings_per_year;
    const assigned = assignedByClass.get(c.id) ?? 0;
    const hasSkillReqs = classesWithRequiredSkills.has(c.id);
    const qualifiedCount = qualifiedCounts.get(c.id) ?? 0;
    const has_skill_gap = hasSkillReqs && qualifiedCount === 0;
    const has_no_assignee = (assigneeCount.get(c.id) ?? 0) === 0;
    if (filters.show_only_gaps && !has_skill_gap && !has_no_assignee && assigned >= target) {
      continue;
    }
    rows.push({
      class_id: c.id,
      class_name: c.name,
      bucket_name: c.allocation_bucket_id ? (bucketName.get(c.allocation_bucket_id) ?? null) : null,
      target_offerings: target,
      assigned_offerings: assigned,
      qualified_instructor_count: qualifiedCount,
      coverage_percent: target > 0 ? Math.round((assigned / target) * 100) : 0,
      has_skill_gap,
      has_no_assignee,
    });
  }

  rows.sort((a, b) => a.coverage_percent - b.coverage_percent);
  return { rows };
}
