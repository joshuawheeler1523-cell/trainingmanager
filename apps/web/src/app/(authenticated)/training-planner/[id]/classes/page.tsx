import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import ClassesEditor from "./classes-editor";

type Params = Promise<{ id: string }>;

export default async function ClassesPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: classes },
    { data: modules },
    { data: trainers },
    { data: classTrainers },
    { data: prerequisites },
  ] = await Promise.all([
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

  return (
    <ClassesEditor
      implementationId={id}
      classes={classes ?? []}
      modules={modules ?? []}
      trainers={trainers ?? []}
      classTrainers={classTrainers ?? []}
      prerequisites={prerequisites ?? []}
    />
  );
}
