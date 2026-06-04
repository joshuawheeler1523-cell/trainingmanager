import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { applyDeptScope, type DepartmentScope } from "@/lib/auth/current-department";

export type QualityBySource = {
  sourceType: string;
  responseCount: number;
  overall: number | null;
  nps: number | null;
};
export type QualityMonth = {
  month: string;
  responseCount: number;
  overall: number | null;
  nps: number | null;
};
export type QualityComment = {
  comment: string;
  overall: number | null;
  sourceType: string;
  submittedAt: string;
};
export type QualityL1 = {
  responseCount: number;
  overall: number | null;
  knowledge: number | null;
  clarity: number | null;
  engagement: number | null;
  pace: number | null;
  nps: number | null;
};
export type InstructorQuality = {
  l1: QualityL1 | null;
  bySource: QualityBySource[];
  monthly: QualityMonth[];
  comments: QualityComment[];
};
export type InstructorQualityBundle = {
  byInstructor: Map<string, InstructorQuality>;
  /** Department-wide average of per-instructor overall ratings (peer context). */
  peerOverall: number | null;
};

/**
 * Load the instructor-quality picture from the anonymous QR survey — overall +
 * trait averages, per-deliverable-type breakdown, monthly trend, and recent
 * comments — for the current department scope. Entirely automatic; no manual
 * entry. Pass `instructorId` to narrow the per-item reads to one instructor;
 * the department peer average is still computed across everyone.
 */
export async function loadInstructorQuality(
  supabase: SupabaseClient<Database>,
  orgId: string,
  scope: DepartmentScope,
  opts: { instructorId?: string } = {},
): Promise<InstructorQualityBundle> {
  const only = opts.instructorId;
  const narrow = <Q extends { eq(c: string, v: string): Q }>(q: Q): Q =>
    only ? q.eq("instructor_id", only) : q;

  let commentsQuery = applyDeptScope(
    supabase
      .from("instructor_feedback")
      .select("instructor_id, comment, rating_overall, source_type, submitted_at")
      .eq("org_id", orgId)
      .not("comment", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(only ? 12 : 150),
    scope,
  );
  if (only) commentsQuery = commentsQuery.eq("instructor_id", only);

  const [{ data: l1Rows }, { data: sourceRows }, { data: monthRows }, { data: commentRows }] =
    await Promise.all([
      // l1 for ALL in-scope instructors → drives the map + peer average.
      applyDeptScope(supabase.from("v_instructor_quality").select("*").eq("org_id", orgId), scope),
      narrow(
        applyDeptScope(
          supabase.from("v_instructor_quality_by_source").select("*").eq("org_id", orgId),
          scope,
        ),
      ),
      narrow(
        applyDeptScope(
          supabase
            .from("v_instructor_quality_monthly")
            .select("*")
            .eq("org_id", orgId)
            .order("month", { ascending: true }),
          scope,
        ),
      ),
      commentsQuery,
    ]);

  const byInstructor = new Map<string, InstructorQuality>();
  const ensure = (id: string): InstructorQuality => {
    let v = byInstructor.get(id);
    if (!v) {
      v = { l1: null, bySource: [], monthly: [], comments: [] };
      byInstructor.set(id, v);
    }
    return v;
  };

  for (const r of l1Rows ?? []) {
    if (!r.instructor_id) continue;
    ensure(r.instructor_id).l1 = {
      responseCount: r.response_count ?? 0,
      overall: r.overall_avg,
      knowledge: r.knowledge_avg,
      clarity: r.clarity_avg,
      engagement: r.engagement_avg,
      pace: r.pace_avg,
      nps: r.nps,
    };
  }
  for (const r of sourceRows ?? []) {
    if (!r.instructor_id || !r.source_type) continue;
    ensure(r.instructor_id).bySource.push({
      sourceType: r.source_type,
      responseCount: r.response_count ?? 0,
      overall: r.overall_avg,
      nps: r.nps,
    });
  }
  for (const r of monthRows ?? []) {
    if (!r.instructor_id || !r.month) continue;
    ensure(r.instructor_id).monthly.push({
      month: r.month,
      responseCount: r.response_count ?? 0,
      overall: r.overall_avg,
      nps: r.nps,
    });
  }
  for (const c of commentRows ?? []) {
    if (!c.instructor_id || !c.comment) continue;
    ensure(c.instructor_id).comments.push({
      comment: c.comment,
      overall: c.rating_overall,
      sourceType: c.source_type,
      submittedAt: c.submitted_at,
    });
  }

  // Peer context: average of per-instructor overall ratings (those with feedback).
  const overalls = (l1Rows ?? []).map((r) => r.overall_avg).filter((v): v is number => v != null);
  const peerOverall =
    overalls.length > 0
      ? Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 100) / 100
      : null;

  return { byInstructor, peerOverall };
}
