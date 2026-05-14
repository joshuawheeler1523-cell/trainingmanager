import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { ClassWithHours } from "@arbor/shared";
import CatalogClient from "./catalog-client";

export const metadata = {
  title: "Course Catalog",
  robots: { index: false, follow: false },
};

export default async function CatalogPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: org },
    { data: classesData },
    { data: bucketsData },
    { data: requirementsData },
    { data: skillsData },
  ] = await Promise.all([
    supabase.from("organizations").select("id, name, time_zone").eq("id", orgId).maybeSingle(),
    supabase
      .from("classes_with_hours")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name"),
    supabase
      .from("allocation_buckets")
      .select("id, name, color")
      .eq("org_id", orgId)
      .is("archived_at", null),
    supabase
      .from("class_skill_requirements")
      .select("class_id, skill_id, requirement, min_proficiency")
      .eq("org_id", orgId),
    supabase
      .from("skills")
      .select("id, name, category, is_certification, certifying_authority")
      .eq("org_id", orgId)
      .eq("is_archived", false),
  ]);

  const classes = (classesData ?? []) as ClassWithHours[];
  const buckets = bucketsData ?? [];
  const skills = skillsData ?? [];

  const skillById = new Map(skills.map((s) => [s.id, s]));
  const bucketById = new Map(buckets.map((b) => [b.id, b]));

  // Group skill requirements per class so the catalog can render
  // "Prerequisites" sections without N+1.
  const requirementsByClass = new Map<
    string,
    Array<{
      skill_name: string;
      skill_category: string | null;
      min_proficiency: string;
      requirement: string;
      is_certification: boolean;
      certifying_authority: string | null;
    }>
  >();
  for (const r of requirementsData ?? []) {
    const skill = skillById.get(r.skill_id);
    if (!skill) continue;
    const list = requirementsByClass.get(r.class_id) ?? [];
    list.push({
      skill_name: skill.name,
      skill_category: skill.category,
      min_proficiency: r.min_proficiency,
      requirement: r.requirement,
      is_certification: skill.is_certification,
      certifying_authority: skill.certifying_authority,
    });
    requirementsByClass.set(r.class_id, list);
  }

  return (
    <CatalogClient
      orgName={org?.name ?? "Organization"}
      classes={classes}
      bucketById={Object.fromEntries(bucketById)}
      requirementsByClass={Object.fromEntries(requirementsByClass)}
    />
  );
}
