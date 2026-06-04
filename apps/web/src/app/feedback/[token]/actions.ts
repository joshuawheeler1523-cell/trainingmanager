"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

type SubmitArgs = Database["public"]["Functions"]["submit_instructor_feedback"]["Args"];

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function err(message: string): ActionResult<never> {
  return { ok: false, error: { code: "INVALID", message } };
}

// Coerce to an int within [min,max]; anything outside / falsy → undefined
// (which omits the RPC arg so the function falls back to its DEFAULT null).
function clampInt(v: number | null | undefined, min: number, max: number): number | undefined {
  if (v == null || Number.isNaN(v)) return undefined;
  const n = Math.round(v);
  return n >= min && n <= max ? n : undefined;
}

export type FeedbackInput = {
  instructorId: string;
  overall: number;
  knowledge?: number;
  clarity?: number;
  engagement?: number;
  pace?: number;
  recommend?: number | null;
  confidenceBefore?: number | null;
  confidenceAfter?: number | null;
  intent?: number | null;
  quizAnswers?: { q: string; a: number }[];
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

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent") ?? null;

  // Single token-gated SECURITY DEFINER RPC: it resolves the link, derives the
  // tenant columns server-side, verifies the instructor is on the deliverable,
  // rate-limits, and inserts. anon has no direct table insert/select.
  const { error } = await anon.rpc("submit_instructor_feedback", {
    p_token: token,
    p_instructor_id: input.instructorId,
    p_overall: overall,
    p_knowledge: clampInt(input.knowledge, 1, 5),
    p_clarity: clampInt(input.clarity, 1, 5),
    p_engagement: clampInt(input.engagement, 1, 5),
    p_pace: clampInt(input.pace, 1, 5),
    p_recommend: input.recommend == null ? undefined : clampInt(input.recommend, 0, 10),
    p_comment: input.comment?.trim() || undefined,
    p_respondent_name: input.respondentName?.trim() || undefined,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
    p_confidence_before: clampInt(input.confidenceBefore, 1, 5),
    p_confidence_after: clampInt(input.confidenceAfter, 1, 5),
    p_intent_to_apply: clampInt(input.intent, 1, 5),
    p_quiz_answers:
      input.quizAnswers && input.quizAnswers.length > 0 ? input.quizAnswers : undefined,
  } as SubmitArgs);
  if (error) {
    const m = error.message;
    const friendly = m.includes("inactive_link")
      ? "This feedback link is no longer active."
      : m.includes("instructor_not_on_deliverable")
        ? "That instructor isn't listed for this session."
        : m.includes("rate_limited")
          ? "You've already submitted feedback recently — thank you!"
          : m;
    return { ok: false, error: { code: error.code, message: friendly } };
  }
  return { ok: true, data: true };
}
