import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type { OnboardingProgress } from "@arbor/shared";
import OnboardingGrid from "./onboarding-grid";

export default async function TrainerOnboardingPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);

  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Trainer Onboarding"
          description="Onboarding checklist for external trainers."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  if (!(await isManager(orgId))) {
    return (
      <div>
        <PageHeader title="Trainer Onboarding" description="Manager-only tool." />
        <div className="text-muted-foreground p-6 text-sm">
          Only managers can manage trainer onboarding. Talk to your org admin if you should have
          access.
        </div>
      </div>
    );
  }

  const [{ data: instructors }, { data: tasks }, { data: progress }] = await Promise.all([
    supabase
      .from("instructors")
      .select("id, full_name, job_title")
      .eq("org_id", orgId)
      .eq("is_external", true)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("onboarding_tasks")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase.from("onboarding_progress").select("*").eq("org_id", orgId),
  ]);

  return (
    <div>
      <PageHeader
        title="Trainer Onboarding"
        description="Track every external trainer through the onboarding checklist. One row per trainer, shared columns across the org."
      />
      <div className="p-6">
        <OnboardingGrid
          instructors={instructors ?? []}
          tasks={tasks ?? []}
          progress={(progress ?? []) as OnboardingProgress[]}
        />
      </div>
    </div>
  );
}
