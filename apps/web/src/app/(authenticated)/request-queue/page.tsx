import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import RequestQueueView from "./request-queue-view";
import type { EducationRequest, Instructor } from "@arbor/shared";

export default async function RequestQueuePage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Request Queue" description="Stakeholder-submitted training requests." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [{ data: requests }, { data: assignments }, { data: instructors }] = await Promise.all([
    supabase
      .from("education_requests")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("education_request_assignments").select("*").eq("org_id", orgId),
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name"),
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
      />
    </div>
  );
}
