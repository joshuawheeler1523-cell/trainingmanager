import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Instructor, ImplTrainerUnavailability } from "@arbor/shared";
import TrainersEditor from "./trainers-editor";

type Params = Promise<{ id: string }>;

export default async function TrainersPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: trainers }, { data: instructors }, { data: unavailability }] = await Promise.all([
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
  ]);

  // Filter unavailability to this impl's trainers (RLS scopes to org but the
  // join through impl_trainer_id is what makes it impl-local).
  const trainerIds = new Set((trainers ?? []).map((t) => t.id));
  const filteredUnavailability = ((unavailability ?? []) as ImplTrainerUnavailability[]).filter(
    (u) => trainerIds.has(u.impl_trainer_id),
  );

  return (
    <TrainersEditor
      implementationId={id}
      trainers={trainers ?? []}
      instructors={(instructors ?? []) as Instructor[]}
      unavailability={filteredUnavailability}
    />
  );
}
