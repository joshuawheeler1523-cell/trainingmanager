import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Implementation } from "@arbor/shared";
import SetupForm from "./setup-form";

type Params = Promise<{ id: string }>;

export default async function SetupPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: impl }, { data: projects }, { data: tras }, { data: buckets }] = await Promise.all(
    [
      supabase
        .from("implementations")
        .select("*")
        .eq("id", id)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("projects")
        .select("id, name")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("name"),
      supabase.from("tras").select("id, project_name").eq("org_id", orgId).order("project_name"),
      supabase
        .from("allocation_buckets")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_archived", false)
        .order("display_order"),
    ],
  );

  if (!impl) notFound();

  return (
    <SetupForm
      implementation={impl as Implementation}
      projects={projects ?? []}
      tras={tras ?? []}
      buckets={buckets ?? []}
    />
  );
}
