// Local alias for "the typed Supabase client we use in app code". Kept here
// so each report-query module doesn't have to repeat the long type.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type TypedSupabase = SupabaseClient<Database>;

/**
 * Apply the active-department filter to a report query. `departmentId === null`
 * means "all departments" (org-wide) — a no-op. Plain value (not the
 * server-only DepartmentScope) so report-query modules stay import-light.
 */
export function scopeDept<Q extends { eq(column: string, value: string): Q }>(
  query: Q,
  departmentId: string | null,
): Q {
  return departmentId ? query.eq("department_id", departmentId) : query;
}
