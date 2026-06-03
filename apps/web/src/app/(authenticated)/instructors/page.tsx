import { Suspense } from "react";
import PageHeader from "@/components/ui/page-header";
import { Label } from "@/components/labels";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import InstructorsView from "./instructors-view";
import {
  recommendOverAllocatedInstructors,
  type CapacityRow,
  type Instructor,
  type WorkloadRow,
  type WorkloadSource,
} from "@arbor/shared";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type SourceBreakdown = Record<WorkloadSource, number>;

async function InstructorsBody({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const search = typeof sp["search"] === "string" ? sp["search"] : "";
  const department = typeof sp["department"] === "string" ? sp["department"] : "";
  const showDeleted = sp["deleted"] === "1";

  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) return null;

  let query = applyDeptScope(
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .order("full_name"),
    scope,
  );
  if (showDeleted) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (department) {
    query = query.eq("department", department);
  }

  const [
    { data: instructors },
    { data: deptRows },
    { data: capacityRows },
    { data: workloadRows },
    { count: activeInstructorCount },
  ] = await Promise.all([
    query,
    applyDeptScope(
      supabase
        .from("instructors")
        .select("department")
        .eq("org_id", orgId)
        .eq("is_external", false)
        .is("deleted_at", null)
        .not("department", "is", null),
      scope,
    ),
    // Views aren't department-scoped; they're keyed by instructor and only
    // looked up for the already-filtered instructors, so keep them org-wide.
    supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId),
    supabase.from("v_instructor_workload").select("*").eq("org_id", orgId),
    applyDeptScope(
      supabase
        .from("instructors")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("is_external", false)
        .is("deleted_at", null),
      scope,
    ),
  ]);

  const list = (instructors ?? []) as Instructor[];

  const departments = Array.from(
    new Set(
      (deptRows ?? []).map((r) => r.department).filter((d): d is string => typeof d === "string"),
    ),
  ).sort();

  // Capacity by instructor
  const capacityByInstructor = new Map<string, CapacityRow>();
  for (const row of (capacityRows ?? []) as CapacityRow[]) {
    capacityByInstructor.set(row.instructor_id, row);
  }

  // Source breakdown by instructor (used by card tooltip)
  const sourceBreakdownByInstructor = new Map<string, SourceBreakdown>();
  for (const row of (workloadRows ?? []) as WorkloadRow[]) {
    const cur = sourceBreakdownByInstructor.get(row.instructor_id) ?? {
      class: 0,
      recurring_task: 0,
      ad_hoc_task: 0,
      education_request: 0,
      project_task: 0,
    };
    cur[row.source] += row.annual_hours || 0;
    sourceBreakdownByInstructor.set(row.instructor_id, cur);
  }

  // Only instructor-domain recommendations live on this page. Class
  // coverage and bucket consumption recs surface on /classes and
  // /allocations respectively, where the fix actually happens.
  const recommendations = recommendOverAllocatedInstructors(
    Array.from(capacityByInstructor.values()),
  );

  return (
    <InstructorsView
      instructors={list}
      departments={departments}
      capacityByInstructor={capacityByInstructor}
      sourceBreakdownByInstructor={sourceBreakdownByInstructor}
      recommendations={recommendations}
      showDeleted={showDeleted}
      activeInstructorCount={activeInstructorCount ?? 0}
    />
  );
}

export default function InstructorsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader
        title={<Label kind="entity.instructor" plural />}
        description="Manage your roster."
      />
      <Suspense
        fallback={
          <div className="p-6">
            <div className="bg-surface h-64 animate-pulse rounded-lg" />
          </div>
        }
      >
        <InstructorsBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
