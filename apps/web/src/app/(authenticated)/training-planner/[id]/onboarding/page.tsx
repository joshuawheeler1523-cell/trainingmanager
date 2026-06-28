import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type { Instructor, OnboardingProgress } from "@arbor/shared";
import { Eyebrow } from "@/components/ui";
import OnboardingGrid from "../../../trainer-onboarding/onboarding-grid";

type Params = Promise<{ id: string }>;

export default async function ImplementationOnboardingPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  if (!(await isManager(orgId))) {
    return (
      <div className="text-muted-foreground text-sm">
        Only managers can view trainer onboarding.
      </div>
    );
  }

  // The implementation's trainers that map to a real instructor on the external
  // bench — free-text-only trainers (no instructor_id) can't be onboarded here.
  const { data: implTrainers } = await supabase
    .from("impl_trainers")
    .select("instructor_id")
    .eq("implementation_id", id)
    .eq("org_id", orgId);

  const instructorIds = [
    ...new Set((implTrainers ?? []).map((t) => t.instructor_id).filter((v): v is string => !!v)),
  ];

  const [{ data: instructors }, { data: tasks }, { data: progress }] = await Promise.all([
    instructorIds.length > 0
      ? supabase
          .from("instructors")
          .select("id, full_name, job_title")
          .eq("org_id", orgId)
          .eq("is_external", true)
          .is("deleted_at", null)
          .in("id", instructorIds)
          .order("full_name")
      : Promise.resolve({ data: [] as Pick<Instructor, "id" | "full_name" | "job_title">[] }),
    supabase
      .from("onboarding_tasks")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase.from("onboarding_progress").select("*").eq("org_id", orgId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Eyebrow>Onboarding</Eyebrow>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Onboarding for this plan&apos;s external trainers. Progress is shared org-wide — a trainer
          onboards once, no matter how many plans they join.
        </p>
      </div>
      <OnboardingGrid
        instructors={instructors ?? []}
        tasks={tasks ?? []}
        progress={(progress ?? []) as OnboardingProgress[]}
        emptyTrainersHint="Assign external trainers to this plan on the Trainers step, then onboard them here."
      />
    </div>
  );
}
