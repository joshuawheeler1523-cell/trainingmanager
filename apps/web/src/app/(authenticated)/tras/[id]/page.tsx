import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import TraWizard from "./tra-wizard";
import type { Tra } from "@arbor/shared";

type Params = Promise<{ id: string }>;

export default async function TraDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [{ data: tra }, { data: deliverables }, { data: deliverableTypes }, { data: aiFlag }] =
    await Promise.all([
      supabase.from("tras").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
      supabase
        .from("tra_deliverables")
        .select("*")
        .eq("tra_id", id)
        .eq("org_id", orgId)
        .order("created_at"),
      supabase
        .from("deliverable_types")
        .select("*")
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .eq("is_archived", false)
        .order("name"),
      supabase
        .from("feature_flags")
        .select("enabled")
        .eq("org_id", orgId)
        .eq("key", "ai_estimation")
        .maybeSingle(),
    ]);

  if (!tra) notFound();

  return (
    <TraWizard
      tra={tra as Tra}
      deliverables={deliverables ?? []}
      deliverableTypes={deliverableTypes ?? []}
      aiAssistantEnabled={aiFlag?.enabled === true}
    />
  );
}
