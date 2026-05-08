import type { CoverageDataset, CoverageReportFilters } from "@arbor/shared";
import type { TypedSupabase } from "./types";

// Class Coverage Report (User Guide §12.2):
//   - assigned offerings vs offerings_per_year
//   - count of qualified instructors (using the existing
//     qualified_instructors_for_class RPC)
//   - flag rows with no assignee or with a skill gap (no qualified instructor)

export async function queryCoverageReport(
  supabase: TypedSupabase,
  orgId: string,
  filters: CoverageReportFilters,
): Promise<CoverageDataset> {
  const [{ data: classes }, { data: assignments }, { data: buckets }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, offerings_per_year, allocation_bucket_id")
      .eq("org_id", orgId)
      .is("deleted_at", null),
    supabase.from("class_instructor_assignments").select("class_id, assigned_offerings"),
    supabase.from("allocation_buckets").select("id, name").eq("org_id", orgId),
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

  // qualified_instructors_for_class RPC, batched. Skip classes with no
  // skill requirements (the RPC returns all active instructors for those —
  // not what we want for "qualified instructor count").
  const { data: skillReqs } = await supabase
    .from("class_skill_requirements")
    .select("class_id")
    .eq("org_id", orgId)
    .eq("requirement", "required");
  const classesWithRequiredSkills = new Set((skillReqs ?? []).map((r) => r.class_id));

  const qualifiedCounts = new Map<string, number>();
  await Promise.all(
    (classes ?? [])
      .filter((c) => classesWithRequiredSkills.has(c.id))
      .map(async (c) => {
        const { data } = await supabase.rpc("qualified_instructors_for_class", {
          p_class_id: c.id,
        });
        qualifiedCounts.set(c.id, data?.length ?? 0);
      }),
  );

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
