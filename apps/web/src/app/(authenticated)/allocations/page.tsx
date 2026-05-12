import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import AllocationsView from "./allocations-view";
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
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
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
  ] = await Promise.all([
    supabase.from("allocation_buckets").select("*").eq("org_id", orgId).order("display_order"),
    supabase.from("global_allocations").select("*").eq("org_id", orgId),
    supabase.from("allocation_groups").select("*").eq("org_id", orgId).order("name"),
    supabase.from("allocation_group_members").select("*").eq("org_id", orgId),
    supabase.from("group_allocations").select("*").eq("org_id", orgId),
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .is("deleted_at", null)
      .order("full_name"),
    supabase.from("individual_allocations").select("*").eq("org_id", orgId),
    supabase
      .from("recurring_tasks")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
    supabase.from("recurring_task_assignments").select("*").eq("org_id", orgId),
    supabase
      .from("ad_hoc_tasks")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase.from("v_bucket_consumption").select("*").eq("org_id", orgId),
  ]);

  const buckets = (bucketRows ?? []) as AllocationBucket[];
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

  return (
    <div>
      <PageHeader
        title="Allocations"
        description="Buckets, global defaults, groups, and individual overrides."
      />
      <AllocationsView
        buckets={buckets}
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
      />
    </div>
  );
}
