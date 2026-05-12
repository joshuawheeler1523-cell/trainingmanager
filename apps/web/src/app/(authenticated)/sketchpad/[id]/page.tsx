import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import SketchpadEditor from "./sketchpad-editor";

type Params = Promise<{ id: string }>;

export default async function SketchpadEditPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: schedule }, { data: rooms }, { data: sessions }] = await Promise.all([
    supabase
      .from("sketchpad_schedules")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("sketchpad_rooms")
      .select("*")
      .eq("schedule_id", id)
      .eq("org_id", orgId)
      .order("position"),
    supabase
      .from("sketchpad_sessions")
      .select("*")
      .eq("schedule_id", id)
      .eq("org_id", orgId)
      .order("starts_at"),
  ]);

  if (!schedule) notFound();

  return <SketchpadEditor schedule={schedule} rooms={rooms ?? []} sessions={sessions ?? []} />;
}
