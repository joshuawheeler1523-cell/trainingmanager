"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { isManager } from "@/lib/auth/role";
import {
  oneOnOneCreateSchema,
  oneOnOneUpdateSchema,
  oneOnOneActionItemCreateSchema,
  oneOnOneActionItemUpdateSchema,
  oneOnOneWorkloadChangeSchema,
  type OneOnOne,
  type OneOnOneActionItem,
  type OneOnOneWorkloadChange,
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

// All actions require the caller to be a manager in the active org. RLS
// enforces this too but we short-circuit early for a clean error message.
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
  if (!(await isManager(orgId))) {
    return {
      ok: false as const,
      error: { code: "FORBIDDEN", message: "Only managers can run 1:1s" },
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: { code: "UNAUTH", message: "Not signed in" } };
  }
  return { ok: true as const, supabase, orgId, departmentId, userId: user.id };
}

function revalidate(id?: string) {
  revalidatePath("/one-on-ones");
  if (id) revalidatePath(`/one-on-ones/${id}`);
}

// ── capacity snapshot helper ───────────────────────────────────────────────
// Reads from v_instructor_capacity, which already reflects deleted_at /
// status / is_external filters. Returns nulls if the instructor doesn't yet
// have a capacity row (e.g., zero assignments).

async function captureSnapshot(
  c: { supabase: Awaited<ReturnType<typeof createClient>>; orgId: string },
  instructorId: string,
): Promise<{ total_hours: number | null; utilization_pct: number | null }> {
  const { data } = await c.supabase
    .from("v_instructor_capacity")
    .select("assigned_hours, utilization_pct")
    .eq("instructor_id", instructorId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  return {
    total_hours: data?.assigned_hours ?? null,
    utilization_pct: data?.utilization_pct ?? null,
  };
}

// ── one_on_ones ────────────────────────────────────────────────────────────

export async function createOneOnOne(input: unknown): Promise<ActionResult<OneOnOne>> {
  const parsed = oneOnOneCreateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const snap = await captureSnapshot(c, parsed.data.instructor_id);

  const { data, error } = await c.supabase
    .from("one_on_ones")
    .insert(
      stripUndefined({
        org_id: c.orgId,
        department_id: c.departmentId,
        instructor_id: parsed.data.instructor_id,
        manager_id: c.userId,
        scheduled_for: parsed.data.scheduled_for ?? new Date().toISOString(),
        snapshot_total_hours: snap.total_hours,
        snapshot_utilization_pct: snap.utilization_pct,
        snapshot_at: new Date().toISOString(),
      }) as unknown as TablesInsert<"one_on_ones">,
    )
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(data.id);
  return { ok: true, data: data as unknown as OneOnOne };
}

export async function updateOneOnOne(id: string, input: unknown): Promise<ActionResult<OneOnOne>> {
  const parsed = oneOnOneUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("one_on_ones")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"one_on_ones">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(id);
  return { ok: true, data: data as unknown as OneOnOne };
}

export async function completeOneOnOne(id: string): Promise<ActionResult<OneOnOne>> {
  const c = await ctx();
  if (!c.ok) return c;

  // Capture a fresh snapshot at completion so the NEXT 1:1 can diff against it.
  const { data: row } = await c.supabase
    .from("one_on_ones")
    .select("instructor_id")
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "1:1 not found" } };
  const snap = await captureSnapshot(c, row.instructor_id);

  const { data, error } = await c.supabase
    .from("one_on_ones")
    .update({
      completed_at: new Date().toISOString(),
      snapshot_total_hours: snap.total_hours,
      snapshot_utilization_pct: snap.utilization_pct,
      snapshot_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(id);
  return { ok: true, data: data as unknown as OneOnOne };
}

export async function deleteOneOnOne(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("one_on_ones")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(id);
  return { ok: true, data: { id } };
}

// ── action items ───────────────────────────────────────────────────────────

export async function createActionItem(
  oneOnOneId: string,
  input: unknown,
): Promise<ActionResult<OneOnOneActionItem>> {
  const parsed = oneOnOneActionItemCreateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("one_on_one_action_items")
    .insert(
      stripUndefined({
        one_on_one_id: oneOnOneId,
        org_id: c.orgId,
        department_id: c.departmentId,
        description: parsed.data.description,
        category: parsed.data.category,
        owner: parsed.data.owner,
        due_by: parsed.data.due_by ?? null,
      }) as unknown as TablesInsert<"one_on_one_action_items">,
    )
    .select()
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(oneOnOneId);
  return { ok: true, data: data as unknown as OneOnOneActionItem };
}

export async function updateActionItem(
  id: string,
  oneOnOneId: string,
  input: unknown,
): Promise<ActionResult<OneOnOneActionItem>> {
  const parsed = oneOnOneActionItemUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("one_on_one_action_items")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"one_on_one_action_items">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(oneOnOneId);
  return { ok: true, data: data as unknown as OneOnOneActionItem };
}

// Resolve an action item — typically called from the NEXT 1:1's "From last
// 1:1" pane. Sets resolved_at + links the resolving 1:1 so we can see "this
// item was closed in the May 13 session."
export async function resolveActionItem(
  id: string,
  resolvingOneOnOneId: string,
  status: "done" | "cancelled",
): Promise<ActionResult<OneOnOneActionItem>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("one_on_one_action_items")
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_in_one_on_one_id: resolvingOneOnOneId,
    })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(resolvingOneOnOneId);
  return { ok: true, data: data as unknown as OneOnOneActionItem };
}

export async function deleteActionItem(
  id: string,
  oneOnOneId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("one_on_one_action_items")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(oneOnOneId);
  return { ok: true, data: { id } };
}

// ── workload change log (Phase 2 reconcile audit) ──────────────────────────
// Each inline edit on the workload column writes one of these rows. The UI
// reads the list back to show the reconcile log.

export async function recordWorkloadChange(
  oneOnOneId: string,
  input: unknown,
): Promise<ActionResult<OneOnOneWorkloadChange>> {
  const parsed = oneOnOneWorkloadChangeSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("one_on_one_workload_changes")
    .insert(
      stripUndefined({
        one_on_one_id: oneOnOneId,
        org_id: c.orgId,
        department_id: c.departmentId,
        source_kind: parsed.data.source_kind,
        source_id: parsed.data.source_id,
        change_kind: parsed.data.change_kind,
        before_value: parsed.data.before_value ?? null,
        after_value: parsed.data.after_value ?? null,
        rationale_category: parsed.data.rationale_category ?? null,
        actor_id: c.userId,
      }) as unknown as TablesInsert<"one_on_one_workload_changes">,
    )
    .select()
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate(oneOnOneId);
  return { ok: true, data: data as unknown as OneOnOneWorkloadChange };
}

// ── inline workload edits ──────────────────────────────────────────────────
// Thin wrappers that mutate the source table AND log a workload change in
// one server roundtrip. Each returns ActionResult<{ id }>; the editor
// re-fetches workload after success.

export async function setClassAssignment(
  oneOnOneId: string,
  classId: string,
  instructorId: string,
  newOfferings: number,
  rationale: string | null,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data: before } = await c.supabase
    .from("class_instructor_assignments")
    .select("id, assigned_offerings")
    .eq("class_id", classId)
    .eq("instructor_id", instructorId)
    .eq("org_id", c.orgId)
    .maybeSingle();

  if (newOfferings <= 0 && before) {
    await c.supabase
      .from("class_instructor_assignments")
      .delete()
      .eq("id", before.id)
      .eq("org_id", c.orgId);
    await c.supabase.from("one_on_one_workload_changes").insert({
      one_on_one_id: oneOnOneId,
      org_id: c.orgId,
      department_id: c.departmentId,
      source_kind: "class_assignment",
      source_id: before.id,
      change_kind: "removed",
      before_value: { assigned_offerings: before.assigned_offerings },
      after_value: null,
      rationale_category: rationale,
      actor_id: c.userId,
    });
  } else if (before) {
    await c.supabase
      .from("class_instructor_assignments")
      .update({ assigned_offerings: newOfferings })
      .eq("id", before.id)
      .eq("org_id", c.orgId);
    await c.supabase.from("one_on_one_workload_changes").insert({
      one_on_one_id: oneOnOneId,
      org_id: c.orgId,
      department_id: c.departmentId,
      source_kind: "class_assignment",
      source_id: before.id,
      change_kind: "modified",
      before_value: { assigned_offerings: before.assigned_offerings },
      after_value: { assigned_offerings: newOfferings },
      rationale_category: rationale,
      actor_id: c.userId,
    });
  }
  revalidate(oneOnOneId);
  return { ok: true, data: { id: classId } };
}

// recurring_task_assignments has a composite key (recurring_task_id,
// instructor_id) — no synthetic id column. Look up + mutate by both.
// The workload change log uses recurring_task_id as the source_id.
//
// Recurring tasks are per-attendee (every assignee is charged the full
// hours), so the only meaningful 1:1 edit is "remove this instructor
// from the task".
export async function removeRecurringAssignment(
  oneOnOneId: string,
  recurringTaskId: string,
  instructorId: string,
  rationale: string | null,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data: before } = await c.supabase
    .from("recurring_task_assignments")
    .select("recurring_task_id")
    .eq("recurring_task_id", recurringTaskId)
    .eq("instructor_id", instructorId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  if (!before) return { ok: false, error: { code: "NOT_FOUND", message: "Assignment not found" } };

  await c.supabase
    .from("recurring_task_assignments")
    .delete()
    .eq("recurring_task_id", recurringTaskId)
    .eq("instructor_id", instructorId)
    .eq("org_id", c.orgId);
  await c.supabase.from("one_on_one_workload_changes").insert({
    one_on_one_id: oneOnOneId,
    org_id: c.orgId,
    department_id: c.departmentId,
    source_kind: "recurring_assignment",
    source_id: recurringTaskId,
    change_kind: "removed",
    before_value: { assigned: true },
    after_value: null,
    rationale_category: rationale,
    actor_id: c.userId,
  });

  revalidate(oneOnOneId);
  return { ok: true, data: { id: recurringTaskId } };
}

export async function markAdHocTaskDone(
  oneOnOneId: string,
  taskId: string,
  rationale: string | null,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { data: before } = await c.supabase
    .from("ad_hoc_tasks")
    .select("id, status, hours")
    .eq("id", taskId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  if (!before) return { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } };

  await c.supabase
    .from("ad_hoc_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", before.id)
    .eq("org_id", c.orgId);
  await c.supabase.from("one_on_one_workload_changes").insert({
    one_on_one_id: oneOnOneId,
    org_id: c.orgId,
    department_id: c.departmentId,
    source_kind: "ad_hoc_task",
    source_id: before.id,
    change_kind: "modified",
    before_value: { status: before.status, hours: before.hours },
    after_value: { status: "done" },
    rationale_category: rationale,
    actor_id: c.userId,
  });
  revalidate(oneOnOneId);
  return { ok: true, data: { id: taskId } };
}
