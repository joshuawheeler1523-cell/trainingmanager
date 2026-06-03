import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import { implementationCompletion, type ImplClass, type Implementation } from "@arbor/shared";
import TrainingPlannerView from "./training-planner-view";

type PlannerRow = Implementation & {
  class_count: number;
  session_count: number;
  completion_pct: number | null;
};

export default async function TrainingPlannerPage() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Training Planner"
          description="Plan large training rollouts with rooms, trainers, modules, and auto-scheduled sessions."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [{ data: implementations }, { data: classes }, { data: sessions }, { data: bucketRows }] =
    await Promise.all([
      applyDeptScope(
        supabase
          .from("implementations")
          .select("*")
          .eq("org_id", orgId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        scope,
      ),
      applyDeptScope(
        supabase
          .from("impl_classes")
          .select("id, implementation_id, total_people_to_train, expected_learners_per_session")
          .eq("org_id", orgId),
        scope,
      ),
      applyDeptScope(
        supabase.from("impl_sessions").select("id, impl_class_id, status").eq("org_id", orgId),
        scope,
      ),
      applyDeptScope(
        supabase
          .from("allocation_buckets")
          .select("*")
          .eq("org_id", orgId)
          .eq("is_archived", false)
          .order("display_order"),
        scope,
      ),
    ]);

  const implList = (implementations ?? []) as Implementation[];
  const classList = (classes ?? []) as Pick<
    ImplClass,
    "id" | "implementation_id" | "total_people_to_train" | "expected_learners_per_session"
  >[];
  const sessionList = (sessions ?? []) as { id: string; impl_class_id: string; status: string }[];

  const classesByImpl = new Map<string, typeof classList>();
  for (const c of classList) {
    const list = classesByImpl.get(c.implementation_id) ?? [];
    list.push(c);
    classesByImpl.set(c.implementation_id, list);
  }
  const sessionsByClass = new Map<string, number>();
  for (const s of sessionList) {
    if (s.status === "cancelled") continue;
    sessionsByClass.set(s.impl_class_id, (sessionsByClass.get(s.impl_class_id) ?? 0) + 1);
  }

  const enriched: PlannerRow[] = implList.map((i) => {
    const classes = classesByImpl.get(i.id) ?? [];
    const session_count = classes.reduce((acc, c) => acc + (sessionsByClass.get(c.id) ?? 0), 0);
    return {
      ...i,
      class_count: classes.length,
      session_count,
      completion_pct: implementationCompletion({ classes, sessionsByClass }),
    };
  });

  return (
    <div>
      <PageHeader
        title="Training Planner"
        description="Plan large training rollouts with rooms, trainers, modules, and auto-scheduled sessions."
      />
      <TrainingPlannerView implementations={enriched} buckets={bucketRows ?? []} />
    </div>
  );
}
