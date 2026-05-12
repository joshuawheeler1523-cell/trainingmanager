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
    const inserts = sessions.map((s) => ({
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
    }));
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
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(scheduleId);
  return { ok: true, data: data };
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
