import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import PageHeader from "@/components/ui/page-header";
import DepartmentsClient from "./departments-client";

export default async function DepartmentsAdminPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Departments" description="Manage departments inside this org." />
        <p className="text-muted-foreground p-6 text-sm">No active organization.</p>
      </div>
    );
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, slug, description, created_at")
    .eq("org_id", orgId)
    .order("name");

  type DeptRow = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
  };

  // Headcount per department — instructors only (the most useful signal).
  const { data: counts } = await supabase
    .from("instructors")
    .select("department_id")
    .eq("org_id", orgId)
    .eq("is_external", false)
    .is("deleted_at", null);

  const headcountByDept = new Map<string, number>();
  for (const r of (counts ?? []) as { department_id: string }[]) {
    headcountByDept.set(r.department_id, (headcountByDept.get(r.department_id) ?? 0) + 1);
  }

  const rows = ((departments ?? []) as DeptRow[]).map((d) => ({
    ...d,
    instructorCount: headcountByDept.get(d.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Sub-org isolation. Each department has its own instructors, classes, allocations, projects, and TRAs."
      />
      <div className="p-6">
        <DepartmentsClient departments={rows} />
      </div>
    </div>
  );
}
