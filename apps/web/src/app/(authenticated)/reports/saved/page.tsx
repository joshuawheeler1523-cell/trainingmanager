import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { REPORT_METADATA, type SavedReport } from "@arbor/shared";
import SavedReportsView from "./saved-reports-view";

export default async function SavedReportsPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Saved reports"
          description="Your saved templates and shared org reports."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const { data } = await supabase
    .from("saved_reports")
    .select("*")
    .eq("org_id", orgId)
    .order("last_run_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const reports = (data ?? []) as SavedReport[];

  return (
    <div>
      <PageHeader
        title="Saved reports"
        description="Templates you (or org admins) have saved. Click to open with the saved filters."
      />
      <div className="space-y-3 p-6">
        <Link href="/reports" className="text-muted-foreground hover:text-foreground text-xs">
          ← All reports
        </Link>
        <SavedReportsView reports={reports} metadata={REPORT_METADATA} />
      </div>
    </div>
  );
}
