import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { ImplSession, Implementation } from "@arbor/shared";
import ScheduleView from "./schedule-view";

type Params = Promise<{ id: string }>;

export default async function SchedulePage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: impl },
    { data: sessions },
    { data: classes },
    { data: trainers },
    { data: rooms },
    { data: org },
    { data: classTrainers },
    { data: pto },
  ] = await Promise.all([
    supabase
      .from("implementations")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("impl_sessions")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .order("scheduled_start"),
    supabase.from("impl_classes").select("*").eq("implementation_id", id).eq("org_id", orgId),
    supabase
      .from("impl_trainers")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .order("name"),
    supabase
      .from("impl_rooms")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .order("name"),
    supabase.from("organizations").select("time_zone").eq("id", orgId).maybeSingle(),
    supabase
      .from("impl_class_trainers")
      .select("impl_class_id, impl_trainer_id")
      .eq("org_id", orgId),
    supabase
      .from("impl_trainer_unavailability")
      .select("impl_trainer_id, starts_at, ends_at")
      .eq("org_id", orgId),
  ]);

  if (!impl) notFound();

  const orgTimeZone = org?.time_zone ?? "America/New_York";

  return (
    <ScheduleView
      implementation={impl as Implementation}
      sessions={(sessions ?? []) as ImplSession[]}
      classes={classes ?? []}
      trainers={trainers ?? []}
      rooms={rooms ?? []}
      backHref={`/training-planner/${id}/calculate`}
      orgTimeZone={orgTimeZone}
      classTrainers={classTrainers ?? []}
      pto={pto ?? []}
    />
  );
}
