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
): Promise<ActionResult<CapacityForecastMonth[]>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Managers only" } };
  }

  // Omit p_department_id entirely for "all departments" (exactOptionalPropertyTypes
  // forbids passing an explicit undefined for an optional arg).
  const { data, error } = await supabase.rpc(
    "capacity_forecast",
    departmentId ? { p_org_id: orgId, p_department_id: departmentId } : { p_org_id: orgId },
  );
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  return { ok: true, data };
}
