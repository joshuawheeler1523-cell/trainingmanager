import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import ForecastView from "./forecast-view";

export const metadata = { title: "Capacity Forecast — Arbor" };

export default async function ForecastPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);

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

  const [{ data: departments }, { data: forecast }, { data: undated }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", orgId).order("name"),
    supabase.rpc("capacity_forecast", { p_org_id: orgId }),
    supabase.rpc("capacity_forecast_undated", { p_org_id: orgId }),
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
          departments={departments ?? []}
        />
      </div>
    </div>
  );
}
