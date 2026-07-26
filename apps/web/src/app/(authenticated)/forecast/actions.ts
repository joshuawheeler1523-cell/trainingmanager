"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type { ActionResult, CapacityForecastItem, CapacityForecastMonth } from "@arbor/shared";

/**
 * Runs the capacity_forecast RPC for the current org, scoped to a department
 * (null = all departments). Manager-only — the forecast is an org/department
 * aggregate. RLS still enforces tenancy inside the (SECURITY INVOKER) RPC.
 */
export async function capacityForecastAction(departmentId: string | null): Promise<
  ActionResult<{
    months: CapacityForecastMonth[];
    undatedHours: number;
    items: CapacityForecastItem[];
  }>
> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Managers only" } };
  }

  // Omit p_department_id entirely for "all departments" (exactOptionalPropertyTypes
  // forbids passing an explicit undefined for an optional arg).
  const forecastArgs = departmentId
    ? { p_org_id: orgId, p_department_id: departmentId }
    : { p_org_id: orgId };
  const [forecast, undated, items] = await Promise.all([
    supabase.rpc("capacity_forecast", forecastArgs),
    supabase.rpc("capacity_forecast_undated", forecastArgs),
    supabase.rpc("capacity_forecast_items", forecastArgs),
  ]);
  if (forecast.error) {
    return { ok: false, error: { code: forecast.error.code, message: forecast.error.message } };
  }

  return {
    ok: true,
    data: {
      months: forecast.data,
      undatedHours: undated.data ?? 0,
      // RPC types `layer` as plain text; the DB only ever emits committed|pipeline.
      items: (items.data ?? []) as CapacityForecastItem[],
    },
  };
}
