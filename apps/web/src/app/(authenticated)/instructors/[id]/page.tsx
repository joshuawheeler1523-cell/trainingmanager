import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import InstructorDetailClient from "./instructor-detail-client";
import type { Instructor, InstructorSkill, Skill } from "@arbor/shared";

type Params = Promise<{ id: string }>;

export type InstructorSkillRow = InstructorSkill & { skill: Skill };

export default async function InstructorDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: instructor },
    { data: auditEntries },
    { data: instructorSkills },
    { data: allSkills },
  ] = await Promise.all([
    supabase.from("instructors").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
    supabase
      .from("audit_log")
      .select("id, operation, changed_fields, old_values, new_values, occurred_at, actor_id")
      .eq("org_id", orgId)
      .eq("table_name", "instructors")
      .eq("record_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("instructor_skills")
      .select("*, skill:skills(*)")
      .eq("instructor_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase.from("skills").select("*").eq("org_id", orgId).eq("is_archived", false).order("name"),
  ]);

  if (!instructor) notFound();

  return (
    <InstructorDetailClient
      instructor={instructor as Instructor}
      auditEntries={auditEntries ?? []}
      instructorSkills={(instructorSkills ?? []) as InstructorSkillRow[]}
      allSkills={allSkills ?? []}
    />
  );
}
