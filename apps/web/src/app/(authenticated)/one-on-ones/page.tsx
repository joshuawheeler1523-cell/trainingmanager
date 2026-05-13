import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type { Instructor, OneOnOne } from "@arbor/shared";
import OneOnOneListView from "./one-on-one-list-view";

export default async function OneOnOnesIndexPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);

  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="1:1s"
          description="Workload-aware manager 1:1s — capacity snapshot, action items, change log."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  if (!(await isManager(orgId))) {
    return (
      <div>
        <PageHeader title="1:1s" description="Manager-only tool." />
        <div className="text-muted-foreground p-6 text-sm">
          Only managers can run 1:1s. Talk to your org admin if you should have access.
        </div>
      </div>
    );
  }

  const [{ data: sessions }, { data: instructors }] = await Promise.all([
    supabase
      .from("one_on_ones")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("scheduled_for", { ascending: false })
      .limit(100),
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name"),
  ]);

  const instructorList = (instructors ?? []) as Instructor[];
  const instructorById = new Map(instructorList.map((i) => [i.id, i.full_name]));

  const rows = ((sessions ?? []) as OneOnOne[]).map((s) => ({
    ...s,
    instructor_name: instructorById.get(s.instructor_id) ?? "—",
  }));

  return (
    <div>
      <PageHeader
        title="1:1s"
        description="Workload-aware manager 1:1s — capacity snapshot, structured topics + concerns, action items that carry across sessions."
      />
      <div className="space-y-6 p-6">
        <OneOnOneListView rows={rows} instructors={instructorList} />
      </div>
    </div>
  );
}
