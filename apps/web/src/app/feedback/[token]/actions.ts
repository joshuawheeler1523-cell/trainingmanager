"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import type { ActionResult } from "@arbor/shared";

type SubmitArgs = Database["public"]["Functions"]["submit_instructor_feedback"]["Args"];

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

export type InstructorRating = {
  instructorId: string;
  overall: number;
  knowledge?: number;
  clarity?: number;
  engagement?: number;
  pace?: number;
  apply?: number;
  findability?: number;
};

export type FeedbackInput = {
  recommend?: number | null;
  comment?: string;
  ratings: InstructorRating[];
};

function friendlyError(message: string): string {
  return message.includes("inactive_link")
    ? "This feedback link is no longer active."
    : message.includes("instructor_not_on_deliverable")
      ? "That instructor isn't listed for this session."
      : message.includes("rate_limited")
        ? "You've already submitted feedback recently — thank you!"
        : message;
}

/**
 * Anonymous L1 (reaction) feedback from the public QR form. A co-taught
 * deliverable can carry several assigned instructors; the learner rates each
 * one separately, so we write ONE feedback row per instructor (sharing the
 * session-level recommend score + comment). Each row rolls up to that
 * instructor's own scorecard. Token-gated; the SECURITY DEFINER RPC derives the
 * tenant columns and verifies each instructor is on the deliverable.
 */
export async function submitInstructorFeedback(
  token: string,
  input: FeedbackInput,
): Promise<ActionResult<true>> {
  const ratings = input.ratings.filter((r) => r.instructorId && clampInt(r.overall, 1, 5));
  if (ratings.length === 0) {
    return err("Please give an overall rating for at least one instructor.");
  }

  const anon = createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const recommend = input.recommend == null ? undefined : clampInt(input.recommend, 0, 10);
  const comment = input.comment?.trim() || undefined;

  for (const r of ratings) {
    const { error } = await anon.rpc("submit_instructor_feedback", {
      p_token: token,
      p_instructor_id: r.instructorId,
      p_overall: clampInt(r.overall, 1, 5),
      p_knowledge: clampInt(r.knowledge, 1, 5),
      p_clarity: clampInt(r.clarity, 1, 5),
      p_engagement: clampInt(r.engagement, 1, 5),
      p_pace: clampInt(r.pace, 1, 5),
      p_recommend: recommend,
      p_comment: comment,
      p_ip: ip ?? undefined,
      p_user_agent: userAgent ?? undefined,
      p_apply: clampInt(r.apply, 1, 5),
      p_findability: clampInt(r.findability, 1, 5),
    } as SubmitArgs);
    if (error) {
      return { ok: false, error: { code: error.code, message: friendlyError(error.message) } };
    }
  }
  return { ok: true, data: true };
}
