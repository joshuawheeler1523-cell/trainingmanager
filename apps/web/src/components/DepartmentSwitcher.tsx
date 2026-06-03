import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId, getDepartmentScope } from "@/lib/auth/current-department";
import { isManager } from "@/lib/auth/role";
import DepartmentSwitcherClient from "./department-switcher-client";

export default async function DepartmentSwitcher() {
  const [supabase, currentOrgId, currentDepartmentId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
    getDepartmentScope(),
  ]);

  if (!currentOrgId) return null;

  const manager = await isManager(currentOrgId);
  const allActive = scope.all;

  // Departments visible to this user in the current org. Managers see all
  // departments in the org; everyone else only sees the ones they're a
  // member of.
  let departments: { id: string; name: string }[] = [];
  if (manager) {
    const { data } = await supabase
      .from("departments")
      .select("id, name")
      .eq("org_id", currentOrgId)
      .order("name");
    departments = data ?? [];
  } else {
    const { data: memberships } = await supabase
      .from("department_memberships")
      .select("department_id, departments!inner(id, name, org_id)")
      .not("accepted_at", "is", null)
      .eq("departments.org_id", currentOrgId);
    type Row = {
      department_id: string;
      departments: { id: string; name: string; org_id: string } | null;
    };
    departments = ((memberships ?? []) as Row[])
      .map((m) => m.departments)
      .filter((d): d is { id: string; name: string; org_id: string } => d != null)
      .map((d) => ({ id: d.id, name: d.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (departments.length === 0) return null;

  return (
    <DepartmentSwitcherClient
      departments={departments}
      currentDepartmentId={currentDepartmentId}
      isManager={manager}
      allActive={allActive}
    />
  );
}
