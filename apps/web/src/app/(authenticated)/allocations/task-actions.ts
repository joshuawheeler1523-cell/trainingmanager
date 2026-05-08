"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import {
  recurringTaskInsertSchema,
  recurringTaskUpdateSchema,
  recurringAssignmentSlateSchema,
  adHocTaskInsertSchema,
  adHocTaskUpdateSchema,
  ADHOC_STATUS_VALUES,
  RECURRING_STATUS_VALUES,
} from "@arbor/shared";
import type { RecurringTask, AdHocTask, AdHocStatus, RecurringStatus } from "@arbor/shared";
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

// ── recurring_tasks ─────────────────────────────────────────────────────────

export async function createRecurringTask(input: unknown): Promise<ActionResult<RecurringTask>> {
  const parsed = recurringTaskInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("recurring_tasks")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: data as RecurringTask };
}

export async function updateRecurringTask(
  id: string,
  input: unknown,
): Promise<ActionResult<RecurringTask>> {
  const parsed = recurringTaskUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("recurring_tasks")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"recurring_tasks">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: data as RecurringTask };
}

export async function archiveRecurringTask(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("recurring_tasks")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { id } };
}

export async function setRecurringTaskStatus(
  id: string,
  status: RecurringStatus,
): Promise<ActionResult<{ id: string }>> {
  if (!RECURRING_STATUS_VALUES.includes(status)) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid status" } };
  }
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("recurring_tasks")
    .update({ status })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { id } };
}

// Replace the assignment slate for a recurring task. Validates that share
// percentages sum to 100 (when there are any assignments).
export async function saveRecurringAssignments(
  recurringTaskId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = recurringAssignmentSlateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const instructorIds = parsed.data.map((r) => r.instructor_id);

  const { error: deleteErr } =
    instructorIds.length === 0
      ? await c.supabase
          .from("recurring_task_assignments")
          .delete()
          .eq("recurring_task_id", recurringTaskId)
          .eq("org_id", c.orgId)
      : await c.supabase
          .from("recurring_task_assignments")
          .delete()
          .eq("recurring_task_id", recurringTaskId)
          .eq("org_id", c.orgId)
          .not("instructor_id", "in", `(${instructorIds.map((i) => `"${i}"`).join(",")})`);
  if (deleteErr) return { ok: false, error: { code: deleteErr.code, message: deleteErr.message } };

  if (parsed.data.length > 0) {
    const { error: upsertErr } = await c.supabase.from("recurring_task_assignments").upsert(
      parsed.data.map((r) => ({
        org_id: c.orgId,
        department_id: c.departmentId,
        recurring_task_id: recurringTaskId,
        instructor_id: r.instructor_id,
        share_percent: r.share_percent,
      })),
      { onConflict: "recurring_task_id,instructor_id" },
    );
    if (upsertErr)
      return { ok: false, error: { code: upsertErr.code, message: upsertErr.message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data: { count: parsed.data.length } };
}

// ── ad_hoc_tasks ─────────────────────────────────────────────────────────────

export async function createAdHocTask(input: unknown): Promise<ActionResult<AdHocTask>> {
  const parsed = adHocTaskInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("ad_hoc_tasks")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: data as AdHocTask };
}

export async function updateAdHocTask(
  id: string,
  input: unknown,
): Promise<ActionResult<AdHocTask>> {
  const parsed = adHocTaskUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const patch = stripUndefined(parsed.data);

  // When status moves into 'done', stamp completed_at; when it moves out, clear it.
  if (typeof patch["status"] === "string") {
    if (patch["status"] === "done") {
      patch["completed_at"] = new Date().toISOString();
    } else {
      patch["completed_at"] = null;
    }
  }

  const { data, error } = await c.supabase
    .from("ad_hoc_tasks")
    .update(patch as unknown as TablesUpdate<"ad_hoc_tasks">)
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: data as AdHocTask };
}

export async function setAdHocTaskStatus(
  id: string,
  status: AdHocStatus,
): Promise<ActionResult<{ id: string }>> {
  if (!ADHOC_STATUS_VALUES.includes(status)) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid status" } };
  }
  return updateAdHocTask(id, { status });
}

export async function deleteAdHocTask(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("ad_hoc_tasks")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { id } };
}
