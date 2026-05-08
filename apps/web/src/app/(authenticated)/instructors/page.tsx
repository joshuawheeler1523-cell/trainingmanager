import { Suspense } from "react";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import InstructorsView from "./instructors-view";
import {
  buildRecommendations,
  type CapacityRow,
  type ClassCoverageInput,
  type BucketConsumptionInput,
  type ForecastWeek,
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

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return null;

  let query = supabase.from("instructors").select("*").eq("org_id", orgId).order("full_name");
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
    { data: classRows },
    { data: classRequirementRows },
    { data: bucketRows },
    { data: globalAllocationRows },
    { data: bucketConsumptionRows },
  ] = await Promise.all([
    query,
    supabase
      .from("instructors")
      .select("department")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .not("department", "is", null),
    supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId),
    supabase.from("v_instructor_workload").select("*").eq("org_id", orgId),
    supabase.from("classes").select("id, name").eq("org_id", orgId).is("deleted_at", null),
    supabase
      .from("class_skill_requirements")
      .select("class_id")
      .eq("org_id", orgId)
      .eq("requirement", "required"),
    supabase.from("allocation_buckets").select("id, name").eq("org_id", orgId),
    supabase.from("global_allocations").select("bucket_id, target_percent").eq("org_id", orgId),
    supabase.from("v_bucket_consumption").select("*").eq("org_id", orgId),
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
    };
    cur[row.source] += row.annual_hours || 0;
    sourceBreakdownByInstructor.set(row.instructor_id, cur);
  }

  // Forecast by instructor — fan-out RPC. Only fetch for instructors that
  // have any workload, to keep this cheap on bigger orgs.
  const today = new Date().toISOString().slice(0, 10);
  const forecastByInstructor = new Map<string, ForecastWeek[]>();
  const instructorsWithWorkload = list.filter((i) => sourceBreakdownByInstructor.has(i.id));
  await Promise.all(
    instructorsWithWorkload.map(async (i) => {
      const { data } = await supabase.rpc("instructor_capacity_forecast", {
        p_instructor_id: i.id,
        p_start: today,
        p_weeks: 8,
      });
      forecastByInstructor.set(i.id, data ?? []);
    }),
  );

  // Recommendations: capacity + class coverage + bucket consumption
  const classRequirementCounts = new Map<string, number>();
  for (const r of (classRequirementRows ?? []) as { class_id: string }[]) {
    classRequirementCounts.set(r.class_id, (classRequirementCounts.get(r.class_id) ?? 0) + 1);
  }

  // Only run coverage RPC for classes that have at least one required skill
  const classesWithRequirements = ((classRows ?? []) as { id: string; name: string }[]).filter(
    (c) => (classRequirementCounts.get(c.id) ?? 0) > 0,
  );
  const classCoverage: ClassCoverageInput[] = await Promise.all(
    classesWithRequirements.map(async (c) => {
      const { data } = await supabase.rpc("qualified_instructors_for_class", {
        p_class_id: c.id,
      });
      return {
        class_id: c.id,
        class_name: c.name,
        qualified_count: data?.length ?? 0,
      };
    }),
  );

  const bucketsById = new Map(
    ((bucketRows ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]),
  );
  const targetByBucket = new Map(
    ((globalAllocationRows ?? []) as { bucket_id: string; target_percent: number }[]).map((g) => [
      g.bucket_id,
      g.target_percent,
    ]),
  );
  const consumedByBucket = new Map(
    ((bucketConsumptionRows ?? []) as { bucket_id: string | null; consumed_hours: number }[])
      .filter((r): r is { bucket_id: string; consumed_hours: number } => r.bucket_id !== null)
      .map((r) => [r.bucket_id, r.consumed_hours]),
  );

  const bucketConsumption: BucketConsumptionInput[] = Array.from(bucketsById.entries()).map(
    ([bucketId, name]) => ({
      bucket_id: bucketId,
      bucket_name: name,
      target_percent: targetByBucket.get(bucketId) ?? 0,
      consumed_hours: consumedByBucket.get(bucketId) ?? 0,
    }),
  );

  // Total org capacity for the bucket-overconsumption rule
  const totalOrgAnnualHours = list
    .filter((i) => i.status === "active")
    .reduce((acc, i) => acc + i.annual_hours, 0);

  const recommendations = buildRecommendations({
    capacity: Array.from(capacityByInstructor.values()),
    classCoverage,
    bucketConsumption,
    totalOrgAnnualHours,
  });

  return (
    <InstructorsView
      instructors={list}
      departments={departments}
      capacityByInstructor={capacityByInstructor}
      sourceBreakdownByInstructor={sourceBreakdownByInstructor}
      forecastByInstructor={forecastByInstructor}
      recommendations={recommendations}
      showDeleted={showDeleted}
    />
  );
}

export default function InstructorsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader title="Instructors" description="Manage your instructor roster." />
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
