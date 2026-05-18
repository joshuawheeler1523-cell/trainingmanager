"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { calcTag } from "@/lib/training-planner/cached-reads";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type AlternativeSlot = {
  scheduled_start: string;
  scheduled_end: string;
  impl_room_id: string;
  impl_trainer_id: string;
  room_name: string;
  trainer_name: string;
  same_trainer: boolean;
  time_distance_hours: number;
};

// Wraps the find_alternative_slots RPC. The Calculate page's existing
// org-scope check is already upstream of this; here we just verify the
// session belongs to this org before delegating.
export async function findAlternativeSlots(
  sessionId: string,
  maxResults = 5,
): Promise<ActionResult<AlternativeSlot[]>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  // Ownership check — confirms the user can see this session in their
  // org before we ask the security-definer function for alternatives.
  const { data: own, error: ownErr } = await supabase
    .from("impl_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (ownErr) return { ok: false, error: { code: ownErr.code, message: ownErr.message } };
  if (!own) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Session not found in this org" } };
  }

  const { data, error } = await supabase.rpc("find_alternative_slots", {
    p_session_id: sessionId,
    p_max_results: maxResults,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: true, data };
}

// Moves a draft session to a new (start, end, room, trainer). Validates
// the new slot is still free at write time — the world could've changed
// between the alternatives fetch and this click.
//
// v1 refuses to move published sessions. The conflict resolver UI
// already filters to drafts only; this is a server-side safety belt.
export async function moveSession(
  sessionId: string,
  to: {
    scheduled_start: string;
    scheduled_end: string;
    impl_room_id: string;
    impl_trainer_id: string;
  },
): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  // Load the session + verify draft status + same impl.
  const { data: cur, error: curErr } = await supabase
    .from("impl_sessions")
    .select("id, status, implementation_id")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (curErr) return { ok: false, error: { code: curErr.code, message: curErr.message } };
  if (!cur) return { ok: false, error: { code: "NOT_FOUND", message: "Session not found" } };
  if (cur.status !== "draft") {
    return {
      ok: false,
      error: {
        code: "PUBLISHED",
        message: "Only draft sessions can be auto-moved. Edit published sessions on the schedule.",
      },
    };
  }

  // Validate the new slot at write time. find_alternative_slots is a
  // SUGGESTION engine — it filters by binary trainer/room overlap but
  // doesn't enforce max_concurrent_sessions or weekly hour budgets. This
  // is the final gate so manual moves can't create states the generator
  // wouldn't.
  //
  //  (1) Room not double-booked
  //  (2) Trainer concurrency — overlapping sessions on this trainer must
  //      not exceed their max_concurrent_sessions
  //  (3) Trainer weekly hours — same ISO week must stay under
  //      availability_hours_per_week
  const newStart = new Date(to.scheduled_start);
  const newEnd = new Date(to.scheduled_end);
  const durationHours = (newEnd.getTime() - newStart.getTime()) / 3_600_000;
  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return {
      ok: false,
      error: { code: "BAD_SLOT", message: "Invalid time range" },
    };
  }

  const { count: roomConflicts } = await supabase
    .from("impl_sessions")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("impl_room_id", to.impl_room_id)
    .neq("id", sessionId)
    .lt("scheduled_start", to.scheduled_end)
    .gt("scheduled_end", to.scheduled_start);
  if ((roomConflicts ?? 0) > 0) {
    return {
      ok: false,
      error: {
        code: "RACE",
        message: "That room slot was just booked. Refresh and pick again.",
      },
    };
  }

  // Trainer concurrency: count overlapping sessions, compare to cap.
  const { data: trainerRow, error: trainerErr } = await supabase
    .from("impl_trainers")
    .select("id, max_concurrent_sessions, availability_hours_per_week, implementation_id")
    .eq("id", to.impl_trainer_id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (trainerErr)
    return { ok: false, error: { code: trainerErr.code, message: trainerErr.message } };
  if (!trainerRow) {
    return { ok: false, error: { code: "BAD_TRAINER", message: "Trainer not found" } };
  }

  const { count: trainerOverlapCount } = await supabase
    .from("impl_sessions")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("impl_trainer_id", to.impl_trainer_id)
    .neq("id", sessionId)
    .lt("scheduled_start", to.scheduled_end)
    .gt("scheduled_end", to.scheduled_start);
  if ((trainerOverlapCount ?? 0) >= trainerRow.max_concurrent_sessions) {
    return {
      ok: false,
      error: {
        code: "TRAINER_CONCURRENCY",
        message: `Trainer is already at their concurrency cap (${trainerRow.max_concurrent_sessions.toString()}) in that slot.`,
      },
    };
  }

  // Trainer weekly hours: sum existing hours for this trainer in the
  // ISO week of the new slot. Exclude this session (so a move within
  // the same week doesn't double-count). Compare to cap.
  const weekStart = startOfIsoWeek(newStart);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const { data: weekSessions } = await supabase
    .from("impl_sessions")
    .select("scheduled_start, scheduled_end")
    .eq("org_id", orgId)
    .eq("impl_trainer_id", to.impl_trainer_id)
    .neq("id", sessionId)
    .gte("scheduled_start", weekStart.toISOString())
    .lt("scheduled_start", weekEnd.toISOString());
  const existingHours = (weekSessions ?? []).reduce((acc, s) => {
    const start = new Date(s.scheduled_start).getTime();
    const end = new Date(s.scheduled_end).getTime();
    return acc + (end - start) / 3_600_000;
  }, 0);
  if (existingHours + durationHours > trainerRow.availability_hours_per_week) {
    return {
      ok: false,
      error: {
        code: "WEEKLY_HOURS_EXCEEDED",
        message: `Trainer would exceed their weekly budget (${trainerRow.availability_hours_per_week.toString()}h) — already at ${existingHours.toFixed(1)}h that week.`,
      },
    };
  }

  const { error: updErr } = await supabase
    .from("impl_sessions")
    .update({
      scheduled_start: to.scheduled_start,
      scheduled_end: to.scheduled_end,
      impl_room_id: to.impl_room_id,
      impl_trainer_id: to.impl_trainer_id,
    })
    .eq("id", sessionId)
    .eq("org_id", orgId);
  if (updErr) return { ok: false, error: { code: updErr.code, message: updErr.message } };

  revalidatePath("/training-planner/conflicts");
  revalidatePath(`/training-planner/${cur.implementation_id}`, "layout");
  // moveSession on a published session shifts cross-impl busy state for
  // any other impl that shares a trainer via instructor_id. We only know
  // the moving impl here, so bust its dry-run cache. Cross-impl freshness
  // falls back to the 60s revalidate.
  updateTag(calcTag(cur.implementation_id));
  return { ok: true, data: { id: sessionId } };
}

// Start-of-ISO-week (Monday 00:00 UTC) for the given date. ISO weeks
// run Monday→Sunday — matches the generator's bucketing.
function startOfIsoWeek(d: Date): Date {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay: 0 = Sun .. 6 = Sat. Shift so Mon=0..Sun=6.
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt;
}
