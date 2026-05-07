import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import InstructorDetailClient from "./instructor-detail-client";
import type { Instructor } from "@arbor/shared";

type Params = Promise<{ id: string }>;

export default async function InstructorDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const { data: instructor } = await supabase
    .from("instructors")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!instructor) notFound();

  const { data: auditEntries } = await supabase
    .from("audit_log")
    .select("id, operation, changed_fields, old_values, new_values, occurred_at, actor_id")
    .eq("org_id", orgId)
    .eq("table_name", "instructors")
    .eq("record_id", id)
    .order("occurred_at", { ascending: false })
    .limit(50);

  return (
    <InstructorDetailClient
      instructor={instructor as Instructor}
      auditEntries={auditEntries ?? []}
    />
  );
}
