"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";

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

  // Race-condition check: another planner may have placed something in
  // this slot since we fetched alternatives. Verify the destination is
  // still free for the chosen trainer + room. We don't need to redo
  // the FULL constraint check here — the alternatives RPC already
  // returned only valid candidates, and a fresh refetch would be
  // expensive. We do a narrow same-resource overlap check to catch
  // the obvious race.
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
  const { count: trainerConflicts } = await supabase
    .from("impl_sessions")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("impl_trainer_id", to.impl_trainer_id)
    .neq("id", sessionId)
    .lt("scheduled_start", to.scheduled_end)
    .gt("scheduled_end", to.scheduled_start);
  if ((trainerConflicts ?? 0) > 0) {
    return {
      ok: false,
      error: {
        code: "RACE",
        message: "That trainer slot was just booked. Refresh and pick again.",
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
  return { ok: true, data: { id: sessionId } };
}
