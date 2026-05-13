import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { sessionsNeeded, type Instructor, type ImplTrainerUnavailability } from "@arbor/shared";
import TrainersEditor, { type TrainerWorkload } from "./trainers-editor";

type Params = Promise<{ id: string }>;

export default async function TrainersPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: trainers },
    { data: instructors },
    { data: unavailability },
    { data: classes },
    { data: classTrainers },
  ] = await Promise.all([
    supabase
      .from("impl_trainers")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name"),
    supabase.from("impl_trainer_unavailability").select("*").eq("org_id", orgId).order("starts_at"),
    supabase
      .from("impl_classes")
      .select("id, hours_per_session, expected_learners_per_session, total_people_to_train")
      .eq("implementation_id", id)
      .eq("org_id", orgId),
    supabase
      .from("impl_class_trainers")
      .select("impl_class_id, impl_trainer_id")
      .eq("org_id", orgId),
  ]);

  // Filter unavailability to this impl's trainers (RLS scopes to org but the
  // join through impl_trainer_id is what makes it impl-local).
  const trainerIds = new Set((trainers ?? []).map((t) => t.id));
  const filteredUnavailability = ((unavailability ?? []) as ImplTrainerUnavailability[]).filter(
    (u) => trainerIds.has(u.impl_trainer_id),
  );

  // Compute total teaching hours + class count per trainer.
  // Hours per class = sessionsNeeded(c) × c.hours_per_session.
  // Then sum each trainer's classes for their grand total.
  const classHoursById = new Map<string, { hours: number }>();
  for (const c of classes ?? []) {
    const hrs = sessionsNeeded(c) * c.hours_per_session;
    classHoursById.set(c.id, { hours: hrs });
  }
  const workload = new Map<string, TrainerWorkload>();
  for (const ct of classTrainers ?? []) {
    if (!trainerIds.has(ct.impl_trainer_id)) continue;
    const entry = classHoursById.get(ct.impl_class_id);
    if (!entry) continue;
    const existing = workload.get(ct.impl_trainer_id) ?? { totalHours: 0, classCount: 0 };
    existing.totalHours += entry.hours;
    existing.classCount += 1;
    workload.set(ct.impl_trainer_id, existing);
  }

  return (
    <TrainersEditor
      implementationId={id}
      trainers={trainers ?? []}
      instructors={(instructors ?? []) as Instructor[]}
      unavailability={filteredUnavailability}
      workload={Object.fromEntries(workload)}
    />
  );
}
