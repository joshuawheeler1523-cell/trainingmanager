// Server-side query wrappers for the workload engine. These are typed
// against our Database schema and return the row types defined in
// @arbor/shared.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CapacityRow, ForecastWeek, WorkloadRow } from "@arbor/shared";

type Client = SupabaseClient<Database>;

export type CapacityFilters = {
  status?: CapacityRow["utilization_status"];
};

// Per-instructor capacity rollup, optionally filtered by utilization_status.
export async function getInstructorCapacityRows(
  supabase: Client,
  orgId: string,
  filters: CapacityFilters = {},
): Promise<CapacityRow[]> {
  let query = supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId);
  if (filters.status) {
    query = query.eq("utilization_status", filters.status);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as CapacityRow[];
}

// All workload rows for one instructor (caller can group with
// `groupWorkloadBySource` from @arbor/shared).
export async function getInstructorWorkloadDetails(
  supabase: Client,
  instructorId: string,
): Promise<WorkloadRow[]> {
  const { data, error } = await supabase
    .from("v_instructor_workload")
    .select("*")
    .eq("instructor_id", instructorId);
  if (error) throw new Error(error.message);
  return data as WorkloadRow[];
}

// Per-week forecast for one instructor over [start, start + weeks*7).
export async function getInstructorForecast(
  supabase: Client,
  instructorId: string,
  start: string,
  weeks = 8,
): Promise<ForecastWeek[]> {
  const { data, error } = await supabase.rpc("instructor_capacity_forecast", {
    p_instructor_id: instructorId,
    p_start: start,
    p_weeks: weeks,
  });
  if (error) throw new Error(error.message);
  return data;
}
