"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type { CapacityForecastMonth } from "@arbor/shared";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Runs the capacity_forecast RPC for the current org, scoped to a department
 * (null = all departments). Manager-only — the forecast is an org/department
 * aggregate. RLS still enforces tenancy inside the (SECURITY INVOKER) RPC.
 */
export async function capacityForecastAction(
  departmentId: string | null,
): Promise<ActionResult<{ months: CapacityForecastMonth[]; undatedHours: number }>> {
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
  const [forecast, undated] = await Promise.all([
    supabase.rpc("capacity_forecast", forecastArgs),
    supabase.rpc("capacity_forecast_undated", forecastArgs),
  ]);
  if (forecast.error) {
    return { ok: false, error: { code: forecast.error.code, message: forecast.error.message } };
  }

  return { ok: true, data: { months: forecast.data, undatedHours: undated.data ?? 0 } };
}
