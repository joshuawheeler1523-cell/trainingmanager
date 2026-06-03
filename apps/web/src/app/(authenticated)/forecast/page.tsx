import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getDepartmentScope } from "@/lib/auth/current-department";
import { isManager } from "@/lib/auth/role";
import type { CapacityForecastItem } from "@arbor/shared";
import ForecastView from "./forecast-view";

export const metadata = { title: "Capacity Forecast — Arbor" };

export default async function ForecastPage() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);

  if (!orgId) {
    return (
      <div>
        <PageHeader title="Capacity Forecast" description="Forward supply vs demand." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  if (!(await isManager(orgId))) {
    return (
      <div>
        <PageHeader title="Capacity Forecast" description="Forward supply vs demand." />
        <div className="text-muted-foreground p-6 text-sm">
          The capacity forecast is an organization-wide view available to managers.
        </div>
      </div>
    );
  }

  // Default the forecast to the active department (when one is selected) so it
  // matches the rest of the workspace; "All departments" → org-wide.
  const activeDeptId = scope.all ? "" : scope.id;
  const deptArg = activeDeptId ? { p_department_id: activeDeptId } : {};

  const [{ data: departments }, { data: forecast }, { data: undated }, { data: items }] =
    await Promise.all([
      supabase.from("departments").select("id, name").eq("org_id", orgId).order("name"),
      supabase.rpc("capacity_forecast", { p_org_id: orgId, ...deptArg }),
      supabase.rpc("capacity_forecast_undated", { p_org_id: orgId, ...deptArg }),
      supabase.rpc("capacity_forecast_items", { p_org_id: orgId, ...deptArg }),
    ]);

  return (
    <div>
      <PageHeader
        title="Capacity Forecast"
        description="Projected demand (committed + incoming pipeline) vs available capacity over the next 12 months, by department."
      />
      <div className="p-6">
        <ForecastView
          initialMonths={forecast ?? []}
          initialUndated={undated ?? 0}
          initialItems={(items ?? []) as CapacityForecastItem[]}
          departments={departments ?? []}
          initialDeptId={activeDeptId}
        />
      </div>
    </div>
  );
}
