import { headers } from "next/headers";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import RequestQueueView from "./request-queue-view";
import type { EducationRequest, Instructor } from "@arbor/shared";

export default async function RequestQueuePage() {
  const [supabase, orgId, headersList, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    headers(),
    getDepartmentScope(),
  ]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Request Queue" description="Stakeholder-submitted training requests." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const origin =
    headersList.get("origin") ??
    (headersList.get("host") ? `https://${headersList.get("host") ?? ""}` : "");

  const [
    { data: requests },
    { data: assignments },
    { data: instructors },
    { data: intakeLinks },
    { data: buckets },
  ] = await Promise.all([
    applyDeptScope(
      supabase
        .from("education_requests")
        .select("*")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      scope,
    ),
    applyDeptScope(
      supabase.from("education_request_assignments").select("*").eq("org_id", orgId),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("instructors")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_external", false)
        .is("deleted_at", null)
        .eq("status", "active")
        .order("full_name"),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("public_intake_links")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("allocation_buckets")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_archived", false)
        .order("display_order"),
      scope,
    ),
  ]);

  return (
    <div>
      <PageHeader
        title="Request Queue"
        description="Stakeholder-submitted training requests. Drag cards to move them through the workflow."
      />
      <RequestQueueView
        requests={(requests ?? []) as EducationRequest[]}
        assignments={assignments ?? []}
        instructors={(instructors ?? []) as Instructor[]}
        intakeLinks={intakeLinks ?? []}
        buckets={buckets ?? []}
        origin={origin}
      />
    </div>
  );
}
