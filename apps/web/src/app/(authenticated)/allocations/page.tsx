import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import AllocationsView from "./allocations-view";
import type {
  AdHocTask,
  AllocationBucket,
  AllocationGroup,
  AllocationGroupMember,
  GlobalAllocation,
  GroupAllocation,
  IndividualAllocation,
  Instructor,
  RecurringTask,
  RecurringTaskAssignment,
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
      />
    </div>
  );
}
