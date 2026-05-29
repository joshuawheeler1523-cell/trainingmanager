import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type {
  Instructor,
  OneOnOne,
  OneOnOneActionItem,
  OneOnOneWorkloadChange,
} from "@arbor/shared";
import OneOnOneEditor from "./one-on-one-editor";

type Params = Promise<{ id: string }>;

export default async function OneOnOneEditorPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  // Race the manager check with the session lookup — both gate notFound().
  const [isMgr, { data: session }] = await Promise.all([
    isManager(orgId),
    supabase
      .from("one_on_ones")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!isMgr || !session) notFound();

  const instructorId = (session as OneOnOne).instructor_id;

  // Pull the instructor + all workload sources for this person. Also pull
  // history needed for the editor: prior 1:1's action items, prior 1:1's
  // snapshot for the delta card, this 1:1's action items, this 1:1's change
  // log, and the last N 1:1s for the trend sparkline.
  const [
    { data: instructor },
    { data: capacity },
    { data: workloadRows },
    { data: priorSessions },
    { data: priorActionItems },
    { data: thisActionItems },
    { data: workloadChanges },
    { data: classAssignmentRows },
    { data: recurringAssignmentRows },
    { data: adHocRows },
    { data: classRows },
    { data: recurringRows },
    { data: bucketRows },
    { data: individualAllocs },
  ] = await Promise.all([
    supabase
      .from("instructors")
      .select("*")
      .eq("id", instructorId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("v_instructor_capacity")
      .select("*")
      .eq("instructor_id", instructorId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("v_instructor_workload")
      .select("*")
      .eq("instructor_id", instructorId)
      .eq("org_id", orgId),
    supabase
      .from("one_on_ones")
      .select("id, scheduled_for, snapshot_total_hours, snapshot_utilization_pct, completed_at")
      .eq("org_id", orgId)
      .eq("instructor_id", instructorId)
      .neq("id", id)
      .is("deleted_at", null)
      .order("scheduled_for", { ascending: false })
      .limit(8),
    supabase
      .from("one_on_one_action_items")
      .select("*")
      .eq("org_id", orgId)
      .in("status", ["open", "in_progress"])
      .order("created_at"),
    supabase
      .from("one_on_one_action_items")
      .select("*")
      .eq("one_on_one_id", id)
      .eq("org_id", orgId)
      .order("created_at"),
    supabase
      .from("one_on_one_workload_changes")
      .select("*")
      .eq("one_on_one_id", id)
      .eq("org_id", orgId)
      .order("created_at"),
    supabase
      .from("class_instructor_assignments")
      .select("*")
      .eq("instructor_id", instructorId)
      .eq("org_id", orgId),
    supabase
      .from("recurring_task_assignments")
      .select("*")
      .eq("instructor_id", instructorId)
      .eq("org_id", orgId),
    supabase
      .from("ad_hoc_tasks")
      .select("*")
      .eq("instructor_id", instructorId)
      .eq("org_id", orgId)
      .in("status", ["open", "in_progress"]),
    supabase
      .from("classes")
      .select(
        "id, name, hours_per_day, total_days, prep_hours_per_offering, logistics_hours_per_offering, custom_day_hours, is_multi_day",
      )
      .eq("org_id", orgId),
    supabase
      .from("recurring_tasks")
      .select("id, name, hours_per_occurrence, frequency, occurrences_per_year")
      .eq("org_id", orgId),
    supabase
      .from("allocation_buckets")
      .select("id, name")
      .eq("org_id", orgId)
      .is("archived_at", null),
    supabase
      .from("individual_allocations")
      .select("*")
      .eq("instructor_id", instructorId)
      .eq("org_id", orgId),
  ]);

  if (!instructor) notFound();

  // Filter prior-session action items (which we asked for org-wide so we get
  // every open item) down to those that originated in OTHER sessions for the
  // SAME instructor. These are the ones that show under "From last 1:1."
  const priorSessionIds = new Set(
    ((priorSessions ?? []) as Array<{ id: string }>).map((p) => p.id),
  );
  const carriedOverItems = ((priorActionItems ?? []) as OneOnOneActionItem[]).filter((a) =>
    priorSessionIds.has(a.one_on_one_id),
  );

  return (
    <OneOnOneEditor
      session={session as OneOnOne}
      instructor={instructor as Instructor}
      capacity={
        capacity
          ? {
              annual_hours: capacity.annual_hours ?? 0,
              assigned_hours: capacity.assigned_hours ?? 0,
              utilization_pct: capacity.utilization_pct ?? 0,
            }
          : null
      }
      workloadRows={
        (workloadRows ?? []) as Array<{
          source: string;
          source_id: string;
          source_label: string;
          annual_hours: number | string;
          quantity: number | null;
          bucket_id: string | null;
        }>
      }
      priorSessions={priorSessions ?? []}
      carriedOverItems={carriedOverItems}
      thisActionItems={(thisActionItems ?? []) as OneOnOneActionItem[]}
      workloadChanges={(workloadChanges ?? []) as OneOnOneWorkloadChange[]}
      classAssignments={classAssignmentRows ?? []}
      recurringAssignments={recurringAssignmentRows ?? []}
      adHocTasks={adHocRows ?? []}
      classes={classRows ?? []}
      recurringTasks={recurringRows ?? []}
      buckets={bucketRows ?? []}
      individualAllocations={individualAllocs ?? []}
    />
  );
}
