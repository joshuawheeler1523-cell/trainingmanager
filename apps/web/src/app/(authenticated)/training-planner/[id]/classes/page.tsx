import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Implementation } from "@arbor/shared";
import { computeFeasibility } from "@/lib/training-planner/feasibility";
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
  ]);

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
