"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import {
  sketchpadScheduleCreateSchema,
  sketchpadScheduleUpdateSchema,
  sketchpadRoomCreateSchema,
  sketchpadRoomUpdateSchema,
  sketchpadSessionCreateSchema,
  sketchpadSessionUpdateSchema,
  type SketchpadSchedule,
  type SketchpadRoom,
  type SketchpadSession,
} from "@arbor/shared";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

function validationError(err: {
  errors: Array<{ message: string; path: (string | number)[] }>;
}): ActionResult<never> {
  const first = err.errors[0];
  const field = first?.path.join(".");
  return {
    ok: false,
    error: {
      code: "VALIDATION",
      message: first?.message ?? "Invalid input",
      ...(field ? { field } : {}),
    },
  };
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

async function ctx() {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  if (!departmentId) {
    return {
      ok: false as const,
      error: { code: "NO_DEPARTMENT", message: "No active department" },
    };
  }
  return { ok: true as const, supabase, orgId, departmentId };
}

function revalidate(scheduleId?: string) {
  revalidatePath("/sketchpad");
  if (scheduleId) revalidatePath(`/sketchpad/${scheduleId}`);
}

// ── schedules ──────────────────────────────────────────────────────────────

export async function createSchedule(input: unknown): Promise<ActionResult<SketchpadSchedule>> {
  const parsed = sketchpadScheduleCreateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("sketchpad_schedules")
    .insert(
      stripUndefined({
        ...parsed.data,
        org_id: c.orgId,
        department_id: c.departmentId,
      }) as unknown as TablesInsert<"sketchpad_schedules">,
    )
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(data.id);
  return { ok: true, data: data };
}

export async function updateSchedule(
  id: string,
  input: unknown,
): Promise<ActionResult<SketchpadSchedule>> {
  const parsed = sketchpadScheduleUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("sketchpad_schedules")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"sketchpad_schedules">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(id);
  return { ok: true, data: data };
}

export async function deleteSchedule(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("sketchpad_schedules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(id);
  return { ok: true, data: { id } };
}

// Duplicate copies the schedule + all rooms + all sessions. Useful for "use
// last month's mockup as a starting point."
export async function duplicateSchedule(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data: source, error: srcErr } = await c.supabase
    .from("sketchpad_schedules")
    .select("*")
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srcErr) return { ok: false, error: { code: srcErr.code, message: srcErr.message } };
  if (!source) return { ok: false, error: { code: "NOT_FOUND", message: "Schedule not found" } };

  const { data: copy, error: copyErr } = await c.supabase
    .from("sketchpad_schedules")
    .insert({
      org_id: source.org_id,
      department_id: source.department_id,
      name: `${source.name} (copy)`,
      notes: source.notes,
      start_date: source.start_date,
      day_count: source.day_count,
      hours_start: source.hours_start,
      hours_end: source.hours_end,
      slot_minutes: source.slot_minutes,
    })
    .select()
    .single();
  if (copyErr) return { ok: false, error: { code: copyErr.code, message: copyErr.message } };

  const { data: rooms } = await c.supabase
    .from("sketchpad_rooms")
    .select("*")
    .eq("schedule_id", id);
  const roomIdMap = new Map<string, string>();
  if (rooms && rooms.length > 0) {
    const inserts = rooms.map((r) => ({
      schedule_id: copy.id,
      org_id: c.orgId,
      name: r.name,
      capacity: r.capacity,
      position: r.position,
    }));
    const { data: newRooms, error: roomsErr } = await c.supabase
      .from("sketchpad_rooms")
      .insert(inserts)
      .select("id, name, position");
    if (roomsErr) return { ok: false, error: { code: roomsErr.code, message: roomsErr.message } };
    // Map source room id → new room id by (position) — positions are unique
    // within a schedule, and we inserted in the same order we selected.
    for (let i = 0; i < rooms.length; i++) {
      const src = rooms[i];
      const dst = newRooms[i];
      if (src && dst) roomIdMap.set(src.id, dst.id);
    }
  }

  const { data: sessions } = await c.supabase
    .from("sketchpad_sessions")
    .select("*")
    .eq("schedule_id", id);
  if (sessions && sessions.length > 0) {
    // Remap group_ids: preserve sibling grouping within the duplicated
    // schedule, but mint fresh UUIDs so the new sessions never share a
    // group with their source schedule.
    const groupIdMap = new Map<string, string>();
    const inserts = sessions.map((s) => {
      let newGroupId: string | null = null;
      if (s.group_id) {
        const existing = groupIdMap.get(s.group_id);
        if (existing) {
          newGroupId = existing;
        } else {
          newGroupId = crypto.randomUUID();
          groupIdMap.set(s.group_id, newGroupId);
        }
      }
      return {
        schedule_id: copy.id,
        room_id: s.room_id ? (roomIdMap.get(s.room_id) ?? null) : null,
        org_id: c.orgId,
        trainer_name: s.trainer_name,
        class_name: s.class_name,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        learner_count: s.learner_count,
        notes: s.notes,
        color: s.color,
        group_id: newGroupId,
      };
    });
    const { error: sessErr } = await c.supabase.from("sketchpad_sessions").insert(inserts);
    if (sessErr) return { ok: false, error: { code: sessErr.code, message: sessErr.message } };
  }

  revalidate(copy.id);
  return { ok: true, data: { id: copy.id } };
}

// ── rooms ──────────────────────────────────────────────────────────────────

export async function createRoom(
  scheduleId: string,
  input: unknown,
): Promise<ActionResult<SketchpadRoom>> {
  const parsed = sketchpadRoomCreateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  // Next position = current max + 1.
  const { data: rows } = await c.supabase
    .from("sketchpad_rooms")
    .select("position")
    .eq("schedule_id", scheduleId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = (rows?.[0]?.position ?? -1) + 1;

  const { data, error } = await c.supabase
    .from("sketchpad_rooms")
    .insert({
      schedule_id: scheduleId,
      org_id: c.orgId,
      name: parsed.data.name,
      capacity: parsed.data.capacity ?? null,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: data };
}

export async function updateRoom(
  id: string,
  scheduleId: string,
  input: unknown,
): Promise<ActionResult<SketchpadRoom>> {
  const parsed = sketchpadRoomUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("sketchpad_rooms")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"sketchpad_rooms">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: data };
}

export async function deleteRoom(
  id: string,
  scheduleId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("sketchpad_rooms")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: { id } };
}

// ── sessions ───────────────────────────────────────────────────────────────

export async function createSession(
  scheduleId: string,
  input: unknown,
): Promise<ActionResult<SketchpadSession>> {
  const parsed = sketchpadSessionCreateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("sketchpad_sessions")
    .insert({
      schedule_id: scheduleId,
      org_id: c.orgId,
      room_id: parsed.data.room_id ?? null,
      trainer_name: parsed.data.trainer_name,
      class_name: parsed.data.class_name,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      learner_count: parsed.data.learner_count ?? null,
      notes: parsed.data.notes,
      color: parsed.data.color,
      group_id: parsed.data.group_id ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: data };
}

// Duplicate a session — drops a copy at the same time on the next day (wraps
// to the last day in the schedule). Mints a group_id on the source if it
// doesn't have one yet, so source + copy become siblings in a series.
// The UI shows "n/N" for each member; numbering is computed client-side
// from group membership ordered by starts_at.
export async function duplicateSession(
  sessionId: string,
  scheduleId: string,
): Promise<ActionResult<{ source: SketchpadSession; copy: SketchpadSession }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data: source, error: srcErr } = await c.supabase
    .from("sketchpad_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("schedule_id", scheduleId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  if (srcErr) return { ok: false, error: { code: srcErr.code, message: srcErr.message } };
  if (!source) return { ok: false, error: { code: "NOT_FOUND", message: "Session not found" } };

  const { data: schedule, error: schedErr } = await c.supabase
    .from("sketchpad_schedules")
    .select("start_date, day_count")
    .eq("id", scheduleId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  if (schedErr) return { ok: false, error: { code: schedErr.code, message: schedErr.message } };
  if (!schedule) return { ok: false, error: { code: "NOT_FOUND", message: "Schedule not found" } };

  // If source isn't grouped yet, mint a group and write it back. We do this
  // first so the returned source row reflects the new state.
  let groupId = source.group_id;
  let updatedSource: SketchpadSession = source;
  if (!groupId) {
    groupId = crypto.randomUUID();
    const { data: patched, error: patchErr } = await c.supabase
      .from("sketchpad_sessions")
      .update({ group_id: groupId })
      .eq("id", source.id)
      .eq("org_id", c.orgId)
      .select()
      .single();
    if (patchErr) return { ok: false, error: { code: patchErr.code, message: patchErr.message } };
    updatedSource = patched;
  }

  // Place the copy at the same time the next day. If the source is already on
  // the last day of the schedule, fall back to the same day so the copy still
  // lands somewhere visible (the user can drag it after).
  const sourceStart = new Date(source.starts_at);
  const sourceEnd = new Date(source.ends_at);
  const sourceDay = new Date(
    sourceStart.getFullYear(),
    sourceStart.getMonth(),
    sourceStart.getDate(),
  );
  const [sy, sm, sd] = schedule.start_date.split("-").map(Number);
  const scheduleStart = new Date(sy ?? 2026, (sm ?? 1) - 1, sd ?? 1);
  const dayIndex = Math.round(
    (sourceDay.getTime() - scheduleStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  const advance = dayIndex < schedule.day_count - 1 ? 1 : 0;
  const offsetMs = advance * 24 * 60 * 60 * 1000;
  const newStart = new Date(sourceStart.getTime() + offsetMs);
  const newEnd = new Date(sourceEnd.getTime() + offsetMs);

  const { data: copy, error: copyErr } = await c.supabase
    .from("sketchpad_sessions")
    .insert({
      schedule_id: scheduleId,
      org_id: c.orgId,
      room_id: source.room_id,
      trainer_name: source.trainer_name,
      class_name: source.class_name,
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
      learner_count: source.learner_count,
      notes: source.notes,
      color: source.color,
      group_id: groupId,
    })
    .select()
    .single();
  if (copyErr) return { ok: false, error: { code: copyErr.code, message: copyErr.message } };

  revalidate(scheduleId);
  return { ok: true, data: { source: updatedSource, copy } };
}

export async function updateSession(
  id: string,
  scheduleId: string,
  input: unknown,
): Promise<ActionResult<SketchpadSession>> {
  const parsed = sketchpadSessionUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("sketchpad_sessions")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"sketchpad_sessions">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: data };
}

export async function deleteSession(
  id: string,
  scheduleId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("sketchpad_sessions")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: { id } };
}

// Bulk-create from a smart-paste payload. Each row has already been parsed
// client-side into the canonical shape; this just validates + inserts.
// Returns the count actually inserted (server may drop rows whose room
// reference doesn't exist on this schedule).
export async function bulkCreateSessions(
  scheduleId: string,
  input: unknown,
): Promise<ActionResult<{ inserted: number }>> {
  const rowSchema = sketchpadSessionCreateSchema;
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "VALIDATION", message: "Expected an array" } };
  }
  const parsed: Array<ReturnType<typeof rowSchema.parse>> = [];
  for (let i = 0; i < input.length; i++) {
    const r = rowSchema.safeParse(input[i]);
    if (!r.success) {
      const first = r.error.errors[0];
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: `Row ${(i + 1).toString()}: ${first?.message ?? "invalid"}`,
        },
      };
    }
    parsed.push(r.data);
  }
  if (parsed.length === 0) {
    return { ok: true, data: { inserted: 0 } };
  }

  const c = await ctx();
  if (!c.ok) return c;

  // Restrict room_id to rooms that belong to this schedule (defense-in-
  // depth; RLS would also reject foreign rooms but we'd rather null-out
  // gracefully than fail the whole batch).
  const { data: legitRooms } = await c.supabase
    .from("sketchpad_rooms")
    .select("id")
    .eq("schedule_id", scheduleId)
    .eq("org_id", c.orgId);
  const validRoomIds = new Set((legitRooms ?? []).map((r) => r.id));

  const rows = parsed.map((p) => ({
    schedule_id: scheduleId,
    room_id: p.room_id && validRoomIds.has(p.room_id) ? p.room_id : null,
    org_id: c.orgId,
    trainer_name: p.trainer_name,
    class_name: p.class_name,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
    learner_count: p.learner_count ?? null,
    notes: p.notes,
    color: p.color,
  }));

  const { error } = await c.supabase.from("sketchpad_sessions").insert(rows);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: { inserted: rows.length } };
}
