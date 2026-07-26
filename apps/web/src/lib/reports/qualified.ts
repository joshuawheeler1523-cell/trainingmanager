import type { TypedSupabase } from "./types";

/**
 * class_id -> ids of instructors meeting that class's required skills, for
 * every class in the org that has required skills.
 *
 * Replaces a per-class `qualified_instructors_for_class` fan-out (one RPC per
 * class, each running a cross join) with the single bulk RPC added for exactly
 * this purpose in 20260513000008_qualified_instructors_bulk.
 *
 * Deliberately called WITHOUT p_department_id, then narrowed by the caller.
 * The bulk RPC's department argument also restricts which *instructors* are
 * considered, whereas the per-class RPC it replaces always considered every
 * active instructor in the org. Passing the department through would quietly
 * change the numbers on a department-scoped report.
 */
export async function fetchQualifiedByClass(
  supabase: TypedSupabase,
  orgId: string,
): Promise<Map<string, string[]>> {
  const { data } = await supabase.rpc("qualified_instructors_for_org", { p_org_id: orgId });

  const byClass = new Map<string, string[]>();
  for (const row of data ?? []) {
    const existing = byClass.get(row.class_id);
    if (existing) existing.push(row.instructor_id);
    else byClass.set(row.class_id, [row.instructor_id]);
  }
  return byClass;
}
