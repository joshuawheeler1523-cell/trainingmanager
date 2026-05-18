"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import {
  externalInstructorCreateSchema,
  implementationInsertSchema,
  implementationSetupSchema,
  implementationUpdateSchema,
  implRoomInsertSchema,
  implRoomUpdateSchema,
  implTrainerInsertSchema,
  implTrainerUpdateSchema,
  implTrainerUnavailabilityInsertSchema,
  implTrainerUnavailabilityUpdateSchema,
  implModuleInsertSchema,
  implModuleUpdateSchema,
  implClassInsertSchema,
  implClassUpdateSchema,
  type Implementation,
  type Instructor,
  type ImplRoom,
  type ImplTrainer,
  type ImplTrainerUnavailability,
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

// Duplicate an implementation: copies the impl row + every child config
// (modules, rooms, classes, trainers, class-trainer links, prereqs, trainer
// unavailability) into a brand-new impl. Sessions are NOT copied — the user
// re-runs Generate Schedule on the clone. Window dates and go-live carry
// over; the user can tweak them on the new impl's Setup step.
//
// The clone starts in draft + step 1 so the wizard nudges the user through
// any data they want to adjust before generating.
export async function duplicateImplementation(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  // 1. Load source. Use service-role-level reads through the user session
  // (RLS still applies — duplicate is gated on "user can read the source").
  const { data: source, error: srcErr } = await c.supabase
    .from("implementations")
    .select("*")
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (srcErr) return { ok: false, error: { code: srcErr.code, message: srcErr.message } };
  if (!source) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Implementation not found" } };
  }

  // 2. Insert the new impl. status=draft, current_step=1, fresh name.
  const newName = `${source.name} (copy)`;
  const { data: cloneRow, error: cloneErr } = await c.supabase
    .from("implementations")
    .insert({
      org_id: c.orgId,
      department_id: source.department_id,
      name: newName,
      description: source.description,
      bucket_id: source.bucket_id,
      window_start_date: source.window_start_date,
      window_end_date: source.window_end_date,
      go_live_date: source.go_live_date,
      go_live_buffer_days: source.go_live_buffer_days,
      lunch_break_start_minutes: source.lunch_break_start_minutes,
      lunch_break_length_minutes: source.lunch_break_length_minutes,
      business_hours_start_local: source.business_hours_start_local,
      business_hours_end_local: source.business_hours_end_local,
      status: "draft",
      current_step: 1,
    })
    .select("id")
    .single();
  if (cloneErr) return { ok: false, error: { code: cloneErr.code, message: cloneErr.message } };
  const newImplId = cloneRow.id;

  // 3. Load and re-insert children, building id maps for FK rewiring.
  const moduleIdMap = new Map<string, string>();
  const roomIdMap = new Map<string, string>();
  const classIdMap = new Map<string, string>();
  const trainerIdMap = new Map<string, string>();

  // ── modules ──
  const { data: modules } = await c.supabase
    .from("impl_modules")
    .select("*")
    .eq("implementation_id", id);
  if (modules && modules.length > 0) {
    const inserts = modules.map((m) => ({
      org_id: c.orgId,
      department_id: m.department_id,
      implementation_id: newImplId,
      name: m.name,
      description: m.description,
      sort_order: m.sort_order,
    }));
    const { data: newModules, error: modErr } = await c.supabase
      .from("impl_modules")
      .insert(inserts)
      .select("id, sort_order, name");
    if (modErr) return { ok: false, error: { code: modErr.code, message: modErr.message } };
    // Re-pair by (sort_order, name) — both are preserved 1:1 in insert order.
    for (let i = 0; i < modules.length; i++) {
      const src = modules[i];
      const dst = newModules[i];
      if (src && dst) moduleIdMap.set(src.id, dst.id);
    }
  }

  // ── rooms ──
  const { data: rooms } = await c.supabase
    .from("impl_rooms")
    .select("*")
    .eq("implementation_id", id);
  if (rooms && rooms.length > 0) {
    const inserts = rooms.map((r) => ({
      org_id: c.orgId,
      department_id: r.department_id,
      implementation_id: newImplId,
      name: r.name,
      location: r.location,
      seat_capacity: r.seat_capacity,
      available_hours_per_day: r.available_hours_per_day,
      available_days_of_week: r.available_days_of_week,
      equipment_notes: r.equipment_notes,
      equipment_tags: r.equipment_tags,
      start_hour_local: r.start_hour_local,
      timezone: r.timezone,
      sort_order: r.sort_order,
    }));
    const { data: newRooms, error: roomsErr } = await c.supabase
      .from("impl_rooms")
      .insert(inserts)
      .select("id");
    if (roomsErr) return { ok: false, error: { code: roomsErr.code, message: roomsErr.message } };
    for (let i = 0; i < rooms.length; i++) {
      const src = rooms[i];
      const dst = newRooms[i];
      if (src && dst) roomIdMap.set(src.id, dst.id);
    }
  }

  // ── trainers ──
  const { data: trainers } = await c.supabase
    .from("impl_trainers")
    .select("*")
    .eq("implementation_id", id);
  if (trainers && trainers.length > 0) {
    const inserts = trainers.map((t) => ({
      org_id: c.orgId,
      department_id: t.department_id,
      implementation_id: newImplId,
      instructor_id: t.instructor_id,
      name: t.name,
      email: t.email,
      availability_hours_per_week: t.availability_hours_per_week,
      max_concurrent_sessions: t.max_concurrent_sessions,
      sort_order: t.sort_order,
    }));
    const { data: newTrainers, error: trErr } = await c.supabase
      .from("impl_trainers")
      .insert(inserts)
      .select("id");
    if (trErr) return { ok: false, error: { code: trErr.code, message: trErr.message } };
    for (let i = 0; i < trainers.length; i++) {
      const src = trainers[i];
      const dst = newTrainers[i];
      if (src && dst) trainerIdMap.set(src.id, dst.id);
    }
  }

  // ── classes ── (module_id needs remapping)
  const { data: classes } = await c.supabase
    .from("impl_classes")
    .select("*")
    .eq("implementation_id", id);
  if (classes && classes.length > 0) {
    const inserts = classes.map((cl) => ({
      org_id: c.orgId,
      department_id: cl.department_id,
      implementation_id: newImplId,
      module_id: cl.module_id ? (moduleIdMap.get(cl.module_id) ?? null) : null,
      name: cl.name,
      description: cl.description,
      hours_per_session: cl.hours_per_session,
      expected_learners_per_session: cl.expected_learners_per_session,
      total_people_to_train: cl.total_people_to_train,
      required_equipment_notes: cl.required_equipment_notes,
      required_equipment_tags: cl.required_equipment_tags,
      sort_order: cl.sort_order,
    }));
    const { data: newClasses, error: clErr } = await c.supabase
      .from("impl_classes")
      .insert(inserts)
      .select("id");
    if (clErr) return { ok: false, error: { code: clErr.code, message: clErr.message } };
    for (let i = 0; i < classes.length; i++) {
      const src = classes[i];
      const dst = newClasses[i];
      if (src && dst) classIdMap.set(src.id, dst.id);
    }
  }

  // ── class_trainers (junction) ── remap both sides
  const { data: classTrainers } = await c.supabase
    .from("impl_class_trainers")
    .select("impl_class_id, impl_trainer_id, department_id")
    .in("impl_class_id", [...classIdMap.keys(), "00000000-0000-0000-0000-000000000000"]);
  if (classTrainers && classTrainers.length > 0) {
    const inserts = classTrainers
      .map((ct) => {
        const newClassId = classIdMap.get(ct.impl_class_id);
        const newTrainerId = trainerIdMap.get(ct.impl_trainer_id);
        if (!newClassId || !newTrainerId) return null;
        return {
          org_id: c.orgId,
          department_id: ct.department_id,
          impl_class_id: newClassId,
          impl_trainer_id: newTrainerId,
        };
      })
      .filter(
        (
          x,
        ): x is {
          org_id: string;
          department_id: string;
          impl_class_id: string;
          impl_trainer_id: string;
        } => !!x,
      );
    if (inserts.length > 0) {
      const { error: ctErr } = await c.supabase.from("impl_class_trainers").insert(inserts);
      if (ctErr) return { ok: false, error: { code: ctErr.code, message: ctErr.message } };
    }
  }

  // ── prerequisites ── remap both sides
  const { data: prereqs } = await c.supabase
    .from("impl_class_prerequisites")
    .select("impl_class_id, prerequisite_id, department_id")
    .in("impl_class_id", [...classIdMap.keys(), "00000000-0000-0000-0000-000000000000"]);
  if (prereqs && prereqs.length > 0) {
    const inserts = prereqs
      .map((p) => {
        const newClassId = classIdMap.get(p.impl_class_id);
        const newPrereqId = classIdMap.get(p.prerequisite_id);
        if (!newClassId || !newPrereqId) return null;
        return {
          org_id: c.orgId,
          department_id: p.department_id,
          impl_class_id: newClassId,
          prerequisite_id: newPrereqId,
        };
      })
      .filter(
        (
          x,
        ): x is {
          org_id: string;
          department_id: string;
          impl_class_id: string;
          prerequisite_id: string;
        } => !!x,
      );
    if (inserts.length > 0) {
      const { error: pErr } = await c.supabase.from("impl_class_prerequisites").insert(inserts);
      if (pErr) return { ok: false, error: { code: pErr.code, message: pErr.message } };
    }
  }

  // ── trainer unavailability ── remap trainer id
  const { data: unavail } = await c.supabase
    .from("impl_trainer_unavailability")
    .select("*")
    .in("impl_trainer_id", [...trainerIdMap.keys(), "00000000-0000-0000-0000-000000000000"]);
  if (unavail && unavail.length > 0) {
    const inserts = unavail
      .map((u) => {
        const newTrainerId = trainerIdMap.get(u.impl_trainer_id);
        if (!newTrainerId) return null;
        return {
          org_id: c.orgId,
          department_id: u.department_id,
          impl_trainer_id: newTrainerId,
          starts_at: u.starts_at,
          ends_at: u.ends_at,
          reason: u.reason,
        };
      })
      .filter(
        (
          x,
        ): x is {
          org_id: string;
          department_id: string;
          impl_trainer_id: string;
          starts_at: string;
          ends_at: string;
          reason: string | null;
        } => !!x,
      );
    if (inserts.length > 0) {
      const { error: uErr } = await c.supabase.from("impl_trainer_unavailability").insert(inserts);
      if (uErr) return { ok: false, error: { code: uErr.code, message: uErr.message } };
    }
  }

  revalidateImpl(newImplId);
  return { ok: true, data: { id: newImplId } };
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
  // Scope to just the rooms page: an in-place edit never changes any layout
  // count, so the layout-wide revalidate `revalidateImpl` would do is wasted
  // refetches on every day-button toggle. createRoom/deleteRoom still need
  // it because they move the roomCount readiness marker.
  revalidatePath(`/training-planner/${implementationId}/rooms`);
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

// External-trainer pool: create a roster entry flagged is_external=true. The
// new row gets a stable instructors.id that impl_trainer rows in any
// implementation can link to via instructor_id — that's what the cross-impl
// trainer-conflict trigger from 20260511000006 joins through. Externals are
// filtered out of every internal-capacity surface (see lib/instructors/scope).
export async function createExternalInstructor(input: unknown): Promise<ActionResult<Instructor>> {
  const parsed = externalInstructorCreateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("instructors")
    .insert({
      org_id: c.orgId,
      department_id: c.departmentId,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      notes: parsed.data.notes,
      is_external: true,
      status: "active",
      annual_hours: 0,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: true, data: data as Instructor };
}

// Promote an existing free-text impl_trainer row (instructor_id NULL) into
// the external pool: set its instructor_id to point at a real instructors row
// flagged is_external=true. After this, the row gets cross-impl conflict
// checking. The caller may have either picked an existing pool entry or
// just created a new one via createExternalInstructor.
export async function linkImplTrainerToInstructor(
  implTrainerId: string,
  implementationId: string,
  instructorId: string,
): Promise<ActionResult<ImplTrainer>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_trainers")
    .update({ instructor_id: instructorId })
    .eq("id", implTrainerId)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

// Soft-delete an external pool entry. Linked impl_trainer rows keep working
// (FK survives, name on impl_trainer is preserved), they're just no longer
// surfaced in the pool picker. The cross-impl conflict trigger joins by
// instructor_id only, so historical conflicts continue to fire even after
// the pool entry is soft-deleted.
export async function softDeleteExternalInstructor(
  instructorId: string,
  implementationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("instructors")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", instructorId)
    .eq("org_id", c.orgId)
    .eq("is_external", true);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: { id: instructorId } };
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

// ── impl_trainer_unavailability (PTO / time off) ────────────────────────────

export async function addTrainerUnavailability(
  trainerId: string,
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplTrainerUnavailability>> {
  const parsed = implTrainerUnavailabilityInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_trainer_unavailability")
    .insert({
      org_id: c.orgId,
      department_id: c.departmentId,
      impl_trainer_id: trainerId,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      reason: parsed.data.reason,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function updateTrainerUnavailability(
  id: string,
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplTrainerUnavailability>> {
  const parsed = implTrainerUnavailabilityUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("impl_trainer_unavailability")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"impl_trainer_unavailability">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data };
}

export async function deleteTrainerUnavailability(
  id: string,
  implementationId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("impl_trainer_unavailability")
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
  // In-place module edits never move a layout readiness count, so scope
  // revalidation to just the modules page (same rationale as updateRoom).
  // createModule/deleteModule still use revalidateImpl because they shift
  // the module-count readiness marker.
  revalidatePath(`/training-planner/${implementationId}/modules`);
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
  // In-place edits don't move any layout readiness count — scope to the
  // classes page to keep batched re-orders (Sort A-Z) cheap. createClass
  // and deleteClass still revalidate the layout for the class-count marker.
  revalidatePath(`/training-planner/${implementationId}/classes`);
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
  // Names of the impls used as anchors for this run. Empty when not in
  // anchor mode. Used by the UI to render "anchored against: X, Y" context.
  anchor_impls?: { id: string; name: string }[];
  // True when anchor mode produced gaps and the generator wrote nothing
  // (atomic abort). The planner's existing schedule is preserved.
  aborted?: boolean;
};

export async function generateSchedule(
  implementationId: string,
  anchorImpls: string[] = [],
): Promise<ActionResult<ScheduleGenResult>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase.rpc("generate_implementation_schedule", {
    p_implementation_id: implementationId,
    p_dry_run: false,
    p_anchor_impls: anchorImpls,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateImpl(implementationId);
  return { ok: true, data: data as ScheduleGenResult };
}

// Run the SQL generator in dry-run mode — same planning math, no writes.
// Used by the Calculate page so its "X can't fit" verdict reflects the
// actual production scheduler instead of an in-memory simulator that
// drifted from the SQL over time. Drafts and published sessions are left
// untouched; the returned JSON shows what WOULD be placed if the planner
// hit Generate right now.
export async function dryRunSchedule(
  implementationId: string,
): Promise<ActionResult<ScheduleGenResult>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase.rpc("generate_implementation_schedule", {
    p_implementation_id: implementationId,
    p_dry_run: true,
  });
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
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
