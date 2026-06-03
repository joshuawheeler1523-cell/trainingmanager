import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import AllocationsView from "./allocations-view";
import { type TeamRosterRow } from "./team-utilization-roster";
import {
  recommendOverConsumedBuckets,
  type AdHocTask,
  type AllocationBucket,
  type AllocationGroup,
  type AllocationGroupMember,
  type BucketConsumptionInput,
  type GlobalAllocation,
  type GroupAllocation,
  type IndividualAllocation,
  type Instructor,
  type Recommendation,
  type RecurringTask,
  type RecurringTaskAssignment,
} from "@arbor/shared";

export default async function AllocationsPage() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Allocations"
          description="Buckets, global defaults, groups, and individual overrides."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [
    { data: bucketRows },
    { data: globalRows },
    { data: groupRows },
    { data: groupMemberRows },
    { data: groupAllocationRows },
    { data: instructorRows },
    { data: individualAllocationRows },
    { data: recurringRows },
    { data: recurringAssignmentRows },
    { data: adHocRows },
    { data: bucketConsumptionRows },
    { data: capacityRows },
    { data: workloadRows },
  ] = await Promise.all([
    // Fetch ALL buckets incl. archived — the Buckets tab needs the archived
    // ones for its "Show archived" / Restore UI. Every other consumer below
    // (pickers, summary) gets the active-only `buckets` derived from this.
    applyDeptScope(
      supabase.from("allocation_buckets").select("*").eq("org_id", orgId).order("display_order"),
      scope,
    ),
    applyDeptScope(supabase.from("global_allocations").select("*").eq("org_id", orgId), scope),
    applyDeptScope(
      supabase.from("allocation_groups").select("*").eq("org_id", orgId).order("name"),
      scope,
    ),
    applyDeptScope(
      supabase.from("allocation_group_members").select("*").eq("org_id", orgId),
      scope,
    ),
    applyDeptScope(supabase.from("group_allocations").select("*").eq("org_id", orgId), scope),
    applyDeptScope(
      supabase
        .from("instructors")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_external", false)
        .is("deleted_at", null)
        .order("full_name"),
      scope,
    ),
    applyDeptScope(supabase.from("individual_allocations").select("*").eq("org_id", orgId), scope),
    applyDeptScope(
      supabase
        .from("recurring_tasks")
        .select("*")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("name"),
      scope,
    ),
    applyDeptScope(
      supabase.from("recurring_task_assignments").select("*").eq("org_id", orgId),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("ad_hoc_tasks")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      scope,
    ),
    applyDeptScope(supabase.from("v_bucket_consumption").select("*").eq("org_id", orgId), scope),
    // For the summary dashboard at the top of the page.
    applyDeptScope(supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId), scope),
    applyDeptScope(supabase.from("v_instructor_workload").select("*").eq("org_id", orgId), scope),
  ]);

  const allBuckets = (bucketRows ?? []) as AllocationBucket[];
  // Active-only set drives the pickers + summary across the other tabs; the
  // Buckets tab receives the full set (allBuckets) so it can list/restore archived.
  const buckets = allBuckets.filter((b) => !b.is_archived);
  const globals = (globalRows ?? []) as GlobalAllocation[];
  const groups = (groupRows ?? []) as AllocationGroup[];
  const groupMembers = (groupMemberRows ?? []) as AllocationGroupMember[];
  const groupAllocations = (groupAllocationRows ?? []) as GroupAllocation[];
  const instructors = (instructorRows ?? []) as Instructor[];
  const individualAllocations = (individualAllocationRows ?? []) as IndividualAllocation[];
  const recurringTasks = (recurringRows ?? []) as RecurringTask[];
  const recurringAssignments = (recurringAssignmentRows ?? []) as RecurringTaskAssignment[];
  const adHocTasks = (adHocRows ?? []) as AdHocTask[];

  // Count instructors who'd be affected by a global default change: active
  // instructors with no individual override and no group with group_allocations.
  const groupIdsWithAllocations = new Set(groupAllocations.map((ga) => ga.group_id));
  const instructorsWithIndividualOverride = new Set(
    individualAllocations.map((ia) => ia.instructor_id),
  );
  const instructorsCoveredByGroup = new Set(
    groupMembers.filter((m) => groupIdsWithAllocations.has(m.group_id)).map((m) => m.instructor_id),
  );
  const globalDefaultUserCount = instructors.filter(
    (i) =>
      i.status === "active" &&
      !instructorsWithIndividualOverride.has(i.id) &&
      !instructorsCoveredByGroup.has(i.id),
  ).length;

  // Bucket-overconsumption recs use the same buckets/globals already
  // fetched, plus v_bucket_consumption for actual hours, normalized
  // against total active org capacity.
  const targetByBucket = new Map(globals.map((g) => [g.bucket_id, g.target_percent] as const));
  const consumedByBucket = new Map(
    ((bucketConsumptionRows ?? []) as { bucket_id: string | null; consumed_hours: number }[])
      .filter((r): r is { bucket_id: string; consumed_hours: number } => r.bucket_id !== null)
      .map((r) => [r.bucket_id, r.consumed_hours] as const),
  );
  const bucketConsumption: BucketConsumptionInput[] = buckets.map((b) => ({
    bucket_id: b.id,
    bucket_name: b.name,
    target_percent: targetByBucket.get(b.id) ?? 0,
    consumed_hours: consumedByBucket.get(b.id) ?? 0,
  }));
  const totalOrgAnnualHours = instructors
    .filter((i) => i.status === "active")
    .reduce((acc, i) => acc + i.annual_hours, 0);
  const recommendations: Recommendation[] = recommendOverConsumedBuckets(
    bucketConsumption,
    totalOrgAnnualHours,
  );

  // Build per-instructor roster rows for the summary dashboard. We need
  // hours per bucket so the capacity bar can render bucket-colored
  // segments. v_instructor_workload has bucket_id at the row level for
  // every workload entry; aggregate to (instructor_id, bucket_id) -> hrs.
  const capacityByInstructor = new Map<
    string,
    { assigned_hours: number; utilization_pct: number | null }
  >();
  for (const c of (capacityRows ?? []) as {
    instructor_id: string;
    assigned_hours: number;
    utilization_pct: number | null;
  }[]) {
    capacityByInstructor.set(c.instructor_id, {
      assigned_hours: c.assigned_hours,
      utilization_pct: c.utilization_pct,
    });
  }
  const hoursByInstructorByBucket = new Map<string, Map<string, number>>();
  for (const w of (workloadRows ?? []) as {
    instructor_id: string;
    bucket_id: string | null;
    annual_hours: number;
  }[]) {
    if (!w.bucket_id) continue;
    const m = hoursByInstructorByBucket.get(w.instructor_id) ?? new Map<string, number>();
    m.set(w.bucket_id, (m.get(w.bucket_id) ?? 0) + (w.annual_hours || 0));
    hoursByInstructorByBucket.set(w.instructor_id, m);
  }
  const rosterRows: TeamRosterRow[] = instructors
    .filter((i) => i.status === "active")
    .map((i) => {
      const cap = capacityByInstructor.get(i.id);
      return {
        id: i.id,
        full_name: i.full_name,
        department: i.department,
        annual_hours: i.annual_hours,
        assigned_hours: cap?.assigned_hours ?? 0,
        utilization_pct: cap?.utilization_pct ?? null,
        hoursPerBucket: hoursByInstructorByBucket.get(i.id) ?? new Map(),
      };
    });

  return (
    <div>
      <PageHeader
        title="Allocations"
        description="Summary of where capacity is going, plus buckets, global defaults, groups, and individual overrides."
      />
      <AllocationsView
        buckets={buckets}
        allBuckets={allBuckets}
        globals={globals}
        groups={groups}
        groupMembers={groupMembers}
        groupAllocations={groupAllocations}
        instructors={instructors}
        individualAllocations={individualAllocations}
        globalDefaultUserCount={globalDefaultUserCount}
        recurringTasks={recurringTasks}
        recurringAssignments={recurringAssignments}
        adHocTasks={adHocTasks}
        recommendations={recommendations}
        rosterRows={rosterRows}
        bucketConsumption={bucketConsumption}
        totalOrgHours={totalOrgAnnualHours}
      />
    </div>
  );
}
