import type { UtilizationTrendDataset, UtilizationTrendReportFilters } from "@arbor/shared";
import type { TypedSupabase } from "./types";

/**
 * Org-wide utilization over time, read from the nightly capacity_snapshots
 * table. History only exists going forward (seeded on the migration that added
 * the table), so early on this returns just a point or two.
 */
export async function queryUtilizationTrendReport(
  supabase: TypedSupabase,
  orgId: string,
  filters: UtilizationTrendReportFilters,
): Promise<UtilizationTrendDataset> {
  const since = new Date();
  since.setMonth(since.getMonth() - filters.months);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("capacity_snapshots")
    .select(
      "snapshot_date, avg_utilization_pct, instructor_count, total_assigned_hours, total_annual_hours",
    )
    .eq("org_id", orgId)
    .gte("snapshot_date", sinceIso)
    .order("snapshot_date", { ascending: true });

  const points = (data ?? []).map((r) => ({
    snapshot_date: r.snapshot_date,
    avg_utilization_pct: r.avg_utilization_pct,
    instructor_count: r.instructor_count,
    total_assigned_hours: r.total_assigned_hours,
    total_annual_hours: r.total_annual_hours,
  }));

  return { points };
}
