"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// Instructor quality is tracked only for classes taught and education
// deliverables produced.
const SOURCE_TYPES = ["class", "education_request"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Create (or re-activate) a feedback QR link for a deliverable. Idempotent per
 * (org, source_type, source_id) — re-generating returns the existing token.
 */
export async function generateFeedbackLink(input: {
  sourceType: string;
  sourceId: string;
  label: string;
}): Promise<ActionResult<{ token: string }>> {
  if (!SOURCE_TYPES.includes(input.sourceType as SourceType)) {
    return { ok: false, error: { code: "BAD_TYPE", message: "Unknown deliverable type" } };
  }
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Managers only" } };
  }

  // Derive the department from the real deliverable (also validates it exists
  // in this org) — never trust a client-supplied department.
  const { data: deliverable } = await supabase
    .from("v_instructor_workload")
    .select("department_id")
    .eq("org_id", orgId)
    .eq("source", input.sourceType)
    .eq("source_id", input.sourceId)
    .limit(1)
    .maybeSingle();
  if (!deliverable?.department_id) {
    return { ok: false, error: { code: "NO_DELIVERABLE", message: "Deliverable not found" } };
  }

  const { data, error } = await supabase
    .from("instructor_feedback_links")
    .upsert(
      {
        org_id: orgId,
        department_id: deliverable.department_id,
        source_type: input.sourceType,
        source_id: input.sourceId,
        label: input.label,
        is_active: true,
      },
      { onConflict: "org_id,source_type,source_id" },
    )
    .select("token")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/instructor-quality");
  return { ok: true, data: { token: data.token } };
}

export async function setFeedbackLinkActive(
  id: string,
  active: boolean,
): Promise<ActionResult<true>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Managers only" } };
  }
  const { error } = await supabase
    .from("instructor_feedback_links")
    .update({ is_active: active })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/instructor-quality");
  return { ok: true, data: true };
}

/** Record a manager-entered Kirkpatrick L2/L3/L4 score for an instructor. */
export async function recordQualityScore(input: {
  instructorId: string;
  kirkpatrickLevel: number;
  metric: string;
  score: number;
  scoreMax?: number;
  periodLabel?: string;
  note?: string;
}): Promise<ActionResult<true>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Managers only" } };
  }
  if (![2, 3, 4].includes(input.kirkpatrickLevel)) {
    return { ok: false, error: { code: "BAD_LEVEL", message: "Level must be 2, 3, or 4" } };
  }
  if (!input.metric.trim()) {
    return { ok: false, error: { code: "BAD_METRIC", message: "Name the metric" } };
  }
  // The score lives in the instructor's own department.
  const { data: inst } = await supabase
    .from("instructors")
    .select("department_id")
    .eq("id", input.instructorId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!inst?.department_id) {
    return { ok: false, error: { code: "NO_INSTRUCTOR", message: "Instructor not found" } };
  }
  const { error } = await supabase.from("instructor_quality_scores").insert({
    org_id: orgId,
    department_id: inst.department_id,
    instructor_id: input.instructorId,
    kirkpatrick_level: input.kirkpatrickLevel,
    metric: input.metric.trim(),
    score: input.score,
    score_max: input.scoreMax ?? 100,
    period_label: input.periodLabel?.trim() || null,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/instructor-quality");
  return { ok: true, data: true };
}

export async function deleteQualityScore(id: string): Promise<ActionResult<true>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  const { error } = await supabase
    .from("instructor_quality_scores")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/instructor-quality");
  return { ok: true, data: true };
}
