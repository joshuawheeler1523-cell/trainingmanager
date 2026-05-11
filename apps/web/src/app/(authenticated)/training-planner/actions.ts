"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import {
  implementationInsertSchema,
  implementationSetupSchema,
  implementationUpdateSchema,
  implRoomInsertSchema,
  implRoomUpdateSchema,
  implTrainerInsertSchema,
  implTrainerUpdateSchema,
  implModuleInsertSchema,
  implModuleUpdateSchema,
  implClassInsertSchema,
  implClassUpdateSchema,
  type Implementation,
  type ImplRoom,
  type ImplTrainer,
  type ImplModule,
  type ImplClass,
  type ImplClassPrerequisite,
} from "@arbor/shared";
import type { TablesUpdate } from "@/lib/supabase/database.types";

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

function revalidateImpl(id?: string) {
  revalidatePath("/training-planner");
  if (id) revalidatePath(`/training-planner/${id}`, "layout");
}

// ── implementations ─────────────────────────────────────────────────────────

export async function createImplementation(input: unknown): Promise<ActionResult<Implementation>> {
  const parsed = implementationInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("implementations")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(data.id);
  return { ok: true, data: data as unknown as Implementation };
}

export async function updateImplementationSetup(
  id: string,
  input: unknown,
): Promise<ActionResult<Implementation>> {
  // The Setup step uses the stricter schema; other callers use the looser one.
  const parsed = implementationSetupSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return updateImpl(id, parsed.data);
}

export async function updateImplementation(
  id: string,
  input: unknown,
): Promise<ActionResult<Implementation>> {
  const parsed = implementationUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  return updateImpl(id, parsed.data);
}

async function updateImpl(
  id: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<Implementation>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("implementations")
    .update(stripUndefined(patch) as unknown as TablesUpdate<"implementations">)
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(id);
  return { ok: true, data: data as unknown as Implementation };
}

export async function archiveImplementation(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("implementations")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(id);
  return { ok: true, data: { id } };
}

// ── impl_rooms ──────────────────────────────────────────────────────────────

export async function createRoom(
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplRoom>> {
  const parsed = implRoomInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_rooms")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      department_id: c.departmentId,
      implementation_id: implementationId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function updateRoom(
  id: string,
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplRoom>> {
  const parsed = implRoomUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_rooms")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"impl_rooms">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function deleteRoom(
  id: string,
  implementationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase.from("impl_rooms").delete().eq("id", id).eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id } };
}

// ── impl_trainers ───────────────────────────────────────────────────────────

export async function createTrainer(
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplTrainer>> {
  const parsed = implTrainerInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_trainers")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      department_id: c.departmentId,
      implementation_id: implementationId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function updateTrainer(
  id: string,
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplTrainer>> {
  const parsed = implTrainerUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_trainers")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"impl_trainers">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function deleteTrainer(
  id: string,
  implementationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_trainers")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id } };
}

// ── impl_modules ────────────────────────────────────────────────────────────

export async function createModule(
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplModule>> {
  const parsed = implModuleInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_modules")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      department_id: c.departmentId,
      implementation_id: implementationId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function updateModule(
  id: string,
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplModule>> {
  const parsed = implModuleUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_modules")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"impl_modules">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function deleteModule(
  id: string,
  implementationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_modules")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id } };
}

// ── impl_classes ────────────────────────────────────────────────────────────

export async function createClass(
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplClass>> {
  const parsed = implClassInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_classes")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      department_id: c.departmentId,
      implementation_id: implementationId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function updateClass(
  id: string,
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplClass>> {
  const parsed = implClassUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_classes")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"impl_classes">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function deleteClass(
  id: string,
  implementationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_classes")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id } };
}

// ── junctions: class trainers + class prerequisites ─────────────────────────

export async function setClassTrainers(
  classId: string,
  implementationId: string,
  trainerIds: string[],
): Promise<ActionResult<{ count: number }>> {
  const c = await ctx();
  if (!c.ok) return c;

  // Replace the slate. Two-step (delete + insert) is fine here — the join
  // table has no audit trail and the wizard never edits this in flight.
  const { error: delErr } = await c.supabase
    .from("impl_class_trainers")
    .delete()
    .eq("impl_class_id", classId)
    .eq("org_id", c.orgId);
  if (delErr) return { ok: false, error: { code: delErr.code, message: delErr.message } };

  if (trainerIds.length === 0) {
    revalidateImpl(implementationId);
    return { ok: true, data: { count: 0 } };
  }

  const rows = trainerIds.map((id) => ({
    org_id: c.orgId,
    department_id: c.departmentId,
    impl_class_id: classId,
    impl_trainer_id: id,
  }));
  const { error: insErr } = await c.supabase.from("impl_class_trainers").insert(rows);
  if (insErr) return { ok: false, error: { code: insErr.code, message: insErr.message } };

  revalidateImpl(implementationId);
  return { ok: true, data: { count: trainerIds.length } };
}

export async function addClassPrerequisite(
  classId: string,
  implementationId: string,
  prerequisiteId: string,
): Promise<ActionResult<ImplClassPrerequisite>> {
  if (classId === prerequisiteId) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "A class cannot be its own prerequisite" },
    };
  }
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_class_prerequisites")
    .insert({
      org_id: c.orgId,
      department_id: c.departmentId,
      impl_class_id: classId,
      prerequisite_id: prerequisiteId,
    })
    .select()
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("cycle")) {
      return {
        ok: false,
        error: { code: "CYCLE", message: "That prerequisite would create a cycle" },
      };
    }
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function removeClassPrerequisite(
  prereqRowId: string,
  implementationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_class_prerequisites")
    .delete()
    .eq("id", prereqRowId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id: prereqRowId } };
}

// ── advance step ────────────────────────────────────────────────────────────

// Saves the current step on the implementation so re-entering the wizard
// resumes where the user left off.
export async function setStep(id: string, step: number): Promise<ActionResult<Implementation>> {
  return updateImpl(id, { current_step: step });
}

// ── schedule generator ─────────────────────────────────────────────────────

export type ScheduleGenResult = {
  sessions: number;
  conflicts: number;
  capacity_gaps: { class_id: string; class_name: string; session_index: number; reason: string }[];
  // Populated by the generator when capacity_gaps is non-empty. All fields
  // are optional because the SQL may emit an empty object {} when the
  // aggregate deficit isn't positive (e.g., gap is due to weekly distribution
  // or prereq sequencing, not raw hours).
  recommendations?: {
    trainer_hours_per_week_to_add?: number;
    trainers_to_add?: number;
    weeks_to_extend?: number;
  };
};

export async function generateSchedule(
  implementationId: string,
): Promise<ActionResult<ScheduleGenResult>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase.rpc("generate_implementation_schedule", {
    p_implementation_id: implementationId,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: data as ScheduleGenResult };
}

// ── session edits (drag, swap trainer/room, cancel) ────────────────────────

export async function updateSessionTime(
  id: string,
  implementationId: string,
  scheduledStart: string,
  scheduledEnd: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_sessions")
    .update({ scheduled_start: scheduledStart, scheduled_end: scheduledEnd })
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id } };
}

export async function updateSessionAssignments(
  id: string,
  implementationId: string,
  patch: { impl_trainer_id?: string | null; impl_room_id?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_sessions")
    .update(
      stripUndefined(patch as Record<string, unknown>) as unknown as TablesUpdate<"impl_sessions">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id } };
}

export async function setSessionStatus(
  id: string,
  implementationId: string,
  status: "draft" | "published" | "cancelled",
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_sessions")
    .update({ status })
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id } };
}

// Bulk-publish: flip every draft session in this implementation to published.
// Per User Guide §11.4, this also flips the implementation's status to active.
export async function publishImplementation(
  implementationId: string,
): Promise<ActionResult<{ count: number }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error: pubError, count } = await c.supabase
    .from("impl_sessions")
    .update({ status: "published" }, { count: "exact" })
    .eq("implementation_id", implementationId)
    .eq("org_id", c.orgId)
    .eq("status", "draft");
  if (pubError) return { ok: false, error: { code: pubError.code, message: pubError.message } };

  await c.supabase
    .from("implementations")
    .update({ status: "active" })
    .eq("id", implementationId)
    .eq("org_id", c.orgId);

  revalidateImpl(implementationId);
  return { ok: true, data: { count: count ?? 0 } };
}
