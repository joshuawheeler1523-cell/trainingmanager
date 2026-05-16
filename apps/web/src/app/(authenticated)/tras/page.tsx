import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import TrasView from "./tras-view";
import type { Tra } from "@arbor/shared";

export default async function TrasPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Work Intake"
          description="Capture training requests, estimate the work, and convert into projects."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const { data } = await supabase
    .from("tras")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  const tras = (data ?? []) as Tra[];

  const departments = Array.from(
    new Set(
      tras
        .map((t) => t.requesting_department)
        .filter((d): d is string => typeof d === "string" && d.length > 0),
    ),
  ).sort();

  return (
    <div>
      <PageHeader
        title="Work Intake"
        description="Capture training requests, estimate the work, and convert into projects."
      />
      <TrasView tras={tras} departments={departments} />
    </div>
  );
}
