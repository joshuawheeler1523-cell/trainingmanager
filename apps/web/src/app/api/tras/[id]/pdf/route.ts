import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import TraPdf from "@/components/pdf/tra-pdf";
import type { Tra, TraApproval, TraEvaluationPlan, TraSuccessCriteria } from "@arbor/shared";

// GET /api/tras/[id]/pdf — generates a PDF for the TRA on demand and streams
// it back as application/pdf. Auth is enforced via Supabase RLS (the cookie-
// authenticated user only sees their org's TRAs).

export const runtime = "nodejs"; // @react-pdf/renderer needs Node runtime
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T): T =>
    q.eq("tra_id", id).eq("org_id", orgId);

  const [
    { data: tra },
    { data: deliverables },
    { data: types },
    { data: org },
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
    scoped(supabase.from("tra_deliverables").select("*")).order("created_at"),
    supabase.from("deliverable_types").select("*").or(`org_id.eq.${orgId},org_id.is.null`),
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    scoped(supabase.from("tra_stakeholders").select("*")).order("position"),
    scoped(supabase.from("tra_audience_roles").select("*")).order("position"),
    scoped(supabase.from("tra_kpis").select("*")).order("position"),
    scoped(supabase.from("tra_success_criteria").select("*")).order("created_at"),
    scoped(supabase.from("tra_objectives").select("*")).order("position"),
    scoped(supabase.from("tra_smes").select("*")).order("position"),
    scoped(supabase.from("tra_evaluation_plan").select("*")).order("created_at"),
    scoped(supabase.from("tra_approvals").select("*")).order("created_at"),
  ]);

  if (!tra) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const buffer = await renderToBuffer(
    TraPdf({
      orgName: org?.name ?? "Organization",
      tra: tra as Tra,
      deliverables: deliverables ?? [],
      deliverableTypes: types ?? [],
      stakeholders: stakeholders ?? [],
      audienceRoles: audienceRoles ?? [],
      kpis: kpis ?? [],
      // These three carry enum columns that the generated row types widen to
      // string/number, so a narrowing cast is required.
      successCriteria: (successCriteria ?? []) as TraSuccessCriteria[],
      objectives: objectives ?? [],
      smes: smes ?? [],
      evaluationPlan: (evaluationPlan ?? []) as TraEvaluationPlan[],
      approvals: (approvals ?? []) as TraApproval[],
    }),
  );

  const safeName = tra.project_name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 64);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tra-${safeName || tra.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
