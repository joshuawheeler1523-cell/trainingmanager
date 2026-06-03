import { Suspense } from "react";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import ClassesView from "./classes-view";
import {
  recommendUndercoveredClasses,
  type ClassCoverageInput,
  type ClassWithHours,
  type Instructor,
  type Recommendation,
} from "@arbor/shared";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function ClassContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";

  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) return null;

  let classQuery = applyDeptScope(
    supabase.from("classes_with_hours").select("*").eq("org_id", orgId).order("name"),
    scope,
  );

  if (showDeleted) {
    classQuery = classQuery.not("deleted_at", "is", null);
  } else {
    classQuery = classQuery.is("deleted_at", null);
  }

  const [
    { data: classes },
    { data: instructors },
    { data: requirementRows },
    { data: moduleRows },
  ] = await Promise.all([
    classQuery,
    applyDeptScope(
      supabase
        .from("instructors")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_external", false)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("full_name"),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("class_skill_requirements")
        .select("class_id")
        .eq("org_id", orgId)
        .eq("requirement", "required"),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("class_modules")
        .select("*")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("name"),
      scope,
    ),
  ]);

  // Coverage warnings: a class is under-covered when 0 or 1 active
  // instructors meet ALL its required skills. The bulk RPC returns
  // (class_id, instructor_id) for every qualified pair in the org in
  // one round-trip — much faster than the per-class N+1 we used to do
  // (~40 RPC calls dropped to 1).
  const requirementCounts = new Map<string, number>();
  for (const r of (requirementRows ?? []) as { class_id: string }[]) {
    requirementCounts.set(r.class_id, (requirementCounts.get(r.class_id) ?? 0) + 1);
  }
  const classList = (classes ?? []) as ClassWithHours[];
  const classesWithRequirements = classList.filter(
    (c) => !c.deleted_at && c.status === "active" && (requirementCounts.get(c.id) ?? 0) > 0,
  );

  const { data: qualifiedPairs } = await supabase.rpc("qualified_instructors_for_org", {
    p_org_id: orgId,
  });
  const qualifiedCountByClass = new Map<string, number>();
  for (const pair of qualifiedPairs ?? []) {
    qualifiedCountByClass.set(pair.class_id, (qualifiedCountByClass.get(pair.class_id) ?? 0) + 1);
  }
  const coverage: ClassCoverageInput[] = classesWithRequirements.map((c) => ({
    class_id: c.id,
    class_name: c.name,
    qualified_count: qualifiedCountByClass.get(c.id) ?? 0,
  }));
  const recommendations: Recommendation[] = recommendUndercoveredClasses(coverage);

  return (
    <ClassesView
      classes={classList}
      instructors={(instructors ?? []) as Instructor[]}
      modules={moduleRows ?? []}
      showDeleted={showDeleted}
      recommendations={recommendations}
    />
  );
}

export default function ClassesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader title="Classes" description="Course catalog and instructor assignments." />
      <div className="p-6">
        <Suspense fallback={<div className="bg-surface h-64 animate-pulse rounded-lg" />}>
          <ClassContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
