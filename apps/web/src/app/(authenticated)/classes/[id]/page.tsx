import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import ClassDetailClient from "./class-detail-client";
import type { ClassWithHours, Instructor } from "@arbor/shared";

type Params = Promise<{ id: string }>;

export type Assignment = {
  id: string;
  instructor_id: string;
  role: string;
  assigned_offerings: number;
};

export default async function ClassDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: cls }, { data: auditEntries }, { data: assignments }, { data: instructors }] =
    await Promise.all([
      supabase
        .from("classes_with_hours")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("audit_log")
        .select("id, operation, changed_fields, old_values, new_values, occurred_at, actor_id")
        .eq("org_id", orgId)
        .eq("table_name", "classes")
        .eq("record_id", id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase
        .from("class_instructor_assignments")
        .select("id, instructor_id, role, assigned_offerings")
        .eq("class_id", id)
        .eq("org_id", orgId)
        .order("role"),
      supabase
        .from("instructors")
        .select("*")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("full_name"),
    ]);

  if (!cls) notFound();

  return (
    <ClassDetailClient
      cls={cls as ClassWithHours}
      assignments={assignments ?? []}
      allInstructors={(instructors ?? []) as Instructor[]}
      auditEntries={auditEntries ?? []}
    />
  );
}
