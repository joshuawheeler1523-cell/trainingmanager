"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function err(message: string): ActionResult<never> {
  return { ok: false, error: { code: "INVALID", message } };
}

// Coerce to an int within [min,max]; anything outside / falsy → null.
function clampInt(v: number | null | undefined, min: number, max: number): number | null {
  if (v == null || Number.isNaN(v)) return null;
  const n = Math.round(v);
  return n >= min && n <= max ? n : null;
}

export type FeedbackInput = {
  instructorId: string;
  overall: number;
  knowledge?: number;
  clarity?: number;
  engagement?: number;
  pace?: number;
  recommend?: number | null;
  comment?: string;
  respondentName?: string;
};

/**
 * Anonymous L1 (reaction) feedback for an instructor, posted from the public
 * QR form. Mirrors the public-intake anon pattern: fresh anon client (no
 * cookies), token-gated, with the database RLS policy
 * `if_insert_public_anon` as the real guard.
 */
export async function submitInstructorFeedback(
  token: string,
  input: FeedbackInput,
): Promise<ActionResult<true>> {
  if (!input.instructorId) return err("Pick the instructor you're rating.");
  const overall = clampInt(input.overall, 1, 5);
  if (!overall) return err("Please give an overall rating.");

  const anon = createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Resolve token → deliverable. anon SELECT is allowed only for active links.
  const { data: link } = await anon
    .from("instructor_feedback_links")
    .select("id, org_id, department_id, source_type, source_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return err("This feedback link is no longer active.");

  // The picked instructor must actually be on this deliverable.
  const { data: ctxRaw } = await anon.rpc("feedback_link_context", { p_token: token });
  const ctx = ctxRaw as { instructors?: { id: string }[] } | null;
  if (!ctx?.instructors?.some((i) => i.id === input.instructorId)) {
    return err("That instructor isn't listed for this session.");
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent") ?? null;

  const { error } = await anon.from("instructor_feedback").insert({
    org_id: link.org_id,
    department_id: link.department_id,
    link_id: link.id,
    source_type: link.source_type,
    source_id: link.source_id,
    instructor_id: input.instructorId,
    kirkpatrick_level: 1,
    rating_overall: overall,
    rating_knowledge: clampInt(input.knowledge, 1, 5),
    rating_clarity: clampInt(input.clarity, 1, 5),
    rating_engagement: clampInt(input.engagement, 1, 5),
    rating_pace: clampInt(input.pace, 1, 5),
    would_recommend: input.recommend == null ? null : clampInt(input.recommend, 0, 10),
    comment: input.comment?.trim() || null,
    respondent_name: input.respondentName?.trim() || null,
    ip,
    user_agent: userAgent,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: true, data: true };
}
