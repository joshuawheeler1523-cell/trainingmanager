import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import TraWizard from "./tra-wizard";
import type { Tra, TraApproval, TraEvaluationPlan, TraSuccessCriteria } from "@arbor/shared";

type Params = Promise<{ id: string }>;

export default async function TraDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const [
    { data: tra },
    { data: deliverables },
    { data: deliverableTypes },
    { data: aiFlag },
    { data: stakeholders },
    { data: audienceRoles },
    { data: kpis },
    { data: successCriteria },
    { data: objectives },
    { data: smes },
    { data: evaluationPlan },
    { data: approvals },
  ] = await Promise.all([
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
    supabase
      .from("tra_stakeholders")
      .select("*")
      .eq("tra_id", id)
      .eq("org_id", orgId)
      .order("position"),
    supabase
      .from("tra_audience_roles")
      .select("*")
      .eq("tra_id", id)
      .eq("org_id", orgId)
      .order("position"),
    supabase.from("tra_kpis").select("*").eq("tra_id", id).eq("org_id", orgId).order("position"),
    supabase
      .from("tra_success_criteria")
      .select("*")
      .eq("tra_id", id)
      .eq("org_id", orgId)
      .order("checkpoint"),
    supabase
      .from("tra_objectives")
      .select("*")
      .eq("tra_id", id)
      .eq("org_id", orgId)
      .order("position"),
    supabase.from("tra_smes").select("*").eq("tra_id", id).eq("org_id", orgId).order("position"),
    supabase
      .from("tra_evaluation_plan")
      .select("*")
      .eq("tra_id", id)
      .eq("org_id", orgId)
      .order("kirkpatrick_level"),
    supabase
      .from("tra_approvals")
      .select("*")
      .eq("tra_id", id)
      .eq("org_id", orgId)
      .order("approval_type"),
  ]);

  if (!tra) notFound();

  // Generated DB types widen check-constrained columns to `string` /
  // `number` — cast back to the narrow enum types since the DB enforces
  // the constraint at write time.
  return (
    <TraWizard
      tra={tra as Tra}
      stakeholders={stakeholders ?? []}
      audienceRoles={audienceRoles ?? []}
      kpis={kpis ?? []}
      successCriteria={(successCriteria ?? []) as TraSuccessCriteria[]}
      objectives={objectives ?? []}
      smes={smes ?? []}
      evaluationPlan={(evaluationPlan ?? []) as TraEvaluationPlan[]}
      approvals={(approvals ?? []) as TraApproval[]}
      deliverables={deliverables ?? []}
      deliverableTypes={deliverableTypes ?? []}
      aiAssistantEnabled={aiFlag?.enabled === true}
    />
  );
}
