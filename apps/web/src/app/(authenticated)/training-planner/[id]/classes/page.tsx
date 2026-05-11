import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Implementation } from "@arbor/shared";
import { computeFeasibility, type CrossImplBusy } from "@/lib/training-planner/feasibility";
import ClassesEditor from "./classes-editor";

type Params = Promise<{ id: string }>;

export default async function ClassesPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: impl },
    { data: rooms },
    { data: classes },
    { data: modules },
    { data: trainers },
    { data: classTrainers },
    { data: prerequisites },
    { data: orgTrainers },
    { data: orgImpls },
    { data: orgPublishedSessions },
  ] = await Promise.all([
    supabase
      .from("implementations")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("impl_rooms").select("*").eq("implementation_id", id).eq("org_id", orgId),
    supabase
      .from("impl_classes")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("impl_modules")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .order("sort_order"),
    supabase
      .from("impl_trainers")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .order("name"),
    supabase.from("impl_class_trainers").select("*").eq("org_id", orgId),
    supabase.from("impl_class_prerequisites").select("*").eq("org_id", orgId),
    // Cross-impl trainer matching (same algorithm as the Calculate page).
    supabase
      .from("impl_trainers")
      .select("id, instructor_id, implementation_id")
      .eq("org_id", orgId),
    supabase.from("implementations").select("id, name, status, deleted_at").eq("org_id", orgId),
    supabase
      .from("impl_sessions")
      .select("impl_trainer_id, scheduled_start, scheduled_end, implementation_id")
      .eq("org_id", orgId)
      .eq("status", "published")
      .neq("implementation_id", id),
  ]);

  // Cross-impl busy map (mirrors Calculate page logic): every published
  // session in another live impl whose trainer links to one of this impl's
  // trainers via instructor_id becomes a busy wall in the simulator.
  const myTrainerByInstructor = new Map<string, string>();
  for (const t of trainers ?? []) {
    if (t.instructor_id) myTrainerByInstructor.set(t.instructor_id, t.id);
  }
  const otherTrainerById = new Map<string, { instructor_id: string | null; impl_id: string }>();
  for (const t of orgTrainers ?? []) {
    if (t.implementation_id === id) continue;
    otherTrainerById.set(t.id, { instructor_id: t.instructor_id, impl_id: t.implementation_id });
  }
  const liveImplIds = new Set(
    (orgImpls ?? [])
      .filter((i) => !i.deleted_at && i.status !== "archived" && i.status !== "cancelled")
      .map((i) => i.id),
  );
  const implNameById = new Map((orgImpls ?? []).map((i) => [i.id, i.name]));
  const crossImplBusyByTrainer = new Map<string, CrossImplBusy[]>();
  for (const s of orgPublishedSessions ?? []) {
    if (!s.impl_trainer_id) continue;
    if (!liveImplIds.has(s.implementation_id)) continue;
    const other = otherTrainerById.get(s.impl_trainer_id);
    if (!other?.instructor_id) continue;
    const myTrainerId = myTrainerByInstructor.get(other.instructor_id);
    if (!myTrainerId) continue;
    const list = crossImplBusyByTrainer.get(myTrainerId) ?? [];
    const implName = implNameById.get(s.implementation_id);
    list.push({
      start: s.scheduled_start,
      end: s.scheduled_end,
      ...(implName ? { implName } : {}),
    });
    crossImplBusyByTrainer.set(myTrainerId, list);
  }

  // Run the same feasibility simulation the Calculate step uses so we can
  // surface per-class distinct rooms/trainers actually used, not just the
  // FTE-based estimate.
  const feasibility = impl
    ? computeFeasibility({
        implementation: impl as unknown as Implementation,
        rooms: rooms ?? [],
        trainers: trainers ?? [],
        classes: classes ?? [],
        classTrainers: classTrainers ?? [],
        prereqs: prerequisites ?? [],
        crossImplBusyByTrainer,
      })
    : null;

  return (
    <ClassesEditor
      implementationId={id}
      windowStartDate={impl?.window_start_date ?? null}
      windowEndDate={impl?.window_end_date ?? null}
      classes={classes ?? []}
      modules={modules ?? []}
      trainers={trainers ?? []}
      classTrainers={classTrainers ?? []}
      prerequisites={prerequisites ?? []}
      classFeasibility={feasibility?.classFeasibility ?? []}
      distinctRoomsUsedTotal={feasibility?.distinctRoomsUsedTotal ?? null}
      distinctTrainersUsedTotal={feasibility?.distinctTrainersUsedTotal ?? null}
    />
  );
}
