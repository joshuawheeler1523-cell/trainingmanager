"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import type { ActionResult } from "@arbor/shared";
import {
  onboardingTaskInsertSchema,
  onboardingTaskUpdateSchema,
  onboardingProgressUpsertSchema,
  type OnboardingTask,
  type OnboardingProgress,
} from "@arbor/shared";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";

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

// Onboarding is an org-wide admin tool (no department dimension — the external
// pool is shared). RLS enforces manager scope too, but we short-circuit here
// for a clean error message and to avoid a wasted roundtrip.
async function ctx() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  if (!(await isManager(orgId))) {
    return {
      ok: false as const,
      error: { code: "FORBIDDEN", message: "Only managers can manage trainer onboarding" },
    };
  }
  return { ok: true as const, supabase, orgId };
}

function revalidate() {
  revalidatePath("/trainer-onboarding");
  // The embedded planner view reads the same rows.
  revalidatePath("/training-planner", "layout");
}

// ── tasks (checklist columns) ───────────────────────────────────────────────

export async function createTask(input: unknown): Promise<ActionResult<OnboardingTask>> {
  const parsed = onboardingTaskInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  // Append to the end of the live checklist unless an explicit order is given.
  let sortOrder = parsed.data.sort_order;
  if (sortOrder === undefined) {
    const { data: last } = await c.supabase
      .from("onboarding_tasks")
      .select("sort_order")
      .eq("org_id", c.orgId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await c.supabase
    .from("onboarding_tasks")
    .insert(
      stripUndefined({
        org_id: c.orgId,
        name: parsed.data.name,
        description: parsed.data.description,
        sort_order: sortOrder,
      }) as unknown as TablesInsert<"onboarding_tasks">,
    )
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate();
  return { ok: true, data: data };
}

export async function updateTask(
  id: string,
  input: unknown,
): Promise<ActionResult<OnboardingTask>> {
  const parsed = onboardingTaskUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("onboarding_tasks")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"onboarding_tasks">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate();
  return { ok: true, data: data };
}

export async function deleteTask(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("onboarding_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", c.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate();
  return { ok: true, data: { id } };
}

const reorderSchema = z.array(z.string().uuid());

export async function reorderTasks(orderedIds: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = reorderSchema.safeParse(orderedIds);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  // Sequential single-column updates — the list is short (handful of columns)
  // and RLS makes a bulk upsert awkward (it would require re-sending NOT NULL
  // columns). One UPDATE per id keeps the audit trail clean.
  for (const [i, id] of parsed.data.entries()) {
    const { error } = await c.supabase
      .from("onboarding_tasks")
      .update({ sort_order: i })
      .eq("id", id)
      .eq("org_id", c.orgId);
    if (error) return { ok: false, error: { code: error.code, message: error.message } };
  }
  revalidate();
  return { ok: true, data: { count: parsed.data.length } };
}

// ── progress (grid cells) ───────────────────────────────────────────────────
//
// Sparse upsert keyed on (instructor_id, task_id). A cell reset to the default
// "not_started" with no date/notes is deleted rather than stored, keeping the
// table sparse.

export async function upsertProgress(
  input: unknown,
): Promise<ActionResult<OnboardingProgress | { id: null }>> {
  const parsed = onboardingProgressUpsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { instructor_id, task_id, status, completed_at, notes } = parsed.data;

  if (status === "not_started" && completed_at === null && notes === null) {
    const { error } = await c.supabase
      .from("onboarding_progress")
      .delete()
      .eq("org_id", c.orgId)
      .eq("instructor_id", instructor_id)
      .eq("task_id", task_id);
    if (error) return { ok: false, error: { code: error.code, message: error.message } };
    revalidate();
    return { ok: true, data: { id: null } };
  }

  const { data, error } = await c.supabase
    .from("onboarding_progress")
    .upsert(
      {
        org_id: c.orgId,
        instructor_id,
        task_id,
        status,
        completed_at,
        notes,
      },
      { onConflict: "instructor_id,task_id" },
    )
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidate();
  return { ok: true, data: data as unknown as OnboardingProgress };
}
