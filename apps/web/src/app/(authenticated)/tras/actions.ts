"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import {
  traInsertSchema,
  traUpdateSchema,
  deliverableInsertSchema,
  deliverableUpdateSchema,
  traUrgencyToProjectPriority,
  type Tra,
  type TraDeliverable,
  type TraUrgency,
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

// ── tras CRUD ───────────────────────────────────────────────────────────────

export async function createTra(input: unknown): Promise<ActionResult<Tra>> {
  const parsed = traInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("tras")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/tras");
  return { ok: true, data: data as Tra };
}

export async function updateTra(id: string, input: unknown): Promise<ActionResult<Tra>> {
  const parsed = traUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("tras")
    .update(
      stripUndefined(parsed.data as Record<string, unknown>) as unknown as TablesUpdate<"tras">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/tras");
  revalidatePath(`/tras/${id}`);
  return { ok: true, data: data as Tra };
}

// ── status transitions ─────────────────────────────────────────────────────

async function setTraStatus(
  traId: string,
  next: "submitted" | "approved" | "rejected",
  allowedFrom: string[],
): Promise<ActionResult<Tra>> {
  const c = await ctx();
  if (!c.ok) return c;

  // Read first so we can validate the from-state explicitly
  const { data: cur, error: readErr } = await c.supabase
    .from("tras")
    .select("*")
    .eq("id", traId)
    .eq("org_id", c.orgId)
    .maybeSingle();

  if (readErr) return { ok: false, error: { code: readErr.code, message: readErr.message } };
  if (!cur) return { ok: false, error: { code: "NOT_FOUND", message: "TRA not found" } };
  if (!allowedFrom.includes(cur.status)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: `Cannot move from "${cur.status}" to "${next}".`,
      },
    };
  }

  const { data, error } = await c.supabase
    .from("tras")
    .update({ status: next })
    .eq("id", traId)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/tras");
  revalidatePath(`/tras/${traId}`);
  return { ok: true, data: data as Tra };
}

export async function submitTra(traId: string): Promise<ActionResult<Tra>> {
  return setTraStatus(traId, "submitted", ["draft"]);
}

export async function approveTra(traId: string): Promise<ActionResult<Tra>> {
  return setTraStatus(traId, "approved", ["submitted"]);
}

export async function rejectTra(traId: string): Promise<ActionResult<Tra>> {
  return setTraStatus(traId, "rejected", ["submitted", "draft"]);
}

// ── deliverables ────────────────────────────────────────────────────────────

export async function addDeliverable(
  traId: string,
  input: unknown,
): Promise<ActionResult<TraDeliverable>> {
  const parsed = deliverableInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("tra_deliverables")
    .insert({
      ...parsed.data,
      tra_id: traId,
      org_id: c.orgId,
      department_id: c.departmentId,
      estimated_hours: 0,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath(`/tras/${traId}`);
  return { ok: true, data };
}

export async function updateDeliverable(
  deliverableId: string,
  traId: string,
  input: unknown,
): Promise<ActionResult<TraDeliverable>> {
  const parsed = deliverableUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("tra_deliverables")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"tra_deliverables">,
    )
    .eq("id", deliverableId)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath(`/tras/${traId}`);
  return { ok: true, data };
}

export async function removeDeliverable(
  deliverableId: string,
  traId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("tra_deliverables")
    .delete()
    .eq("id", deliverableId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath(`/tras/${traId}`);
  return { ok: true, data: { id: deliverableId } };
}

// ── convertTraToProject ─────────────────────────────────────────────────────
// Creates a project + one task per deliverable. Sets the TRA status to
// 'converted' and records the project link both ways. Idempotent: if the
// TRA was already converted, returns the existing project.

export async function convertTraToProject(
  traId: string,
): Promise<ActionResult<{ project_id: string; task_count: number }>> {
  const c = await ctx();
  if (!c.ok) return c;

  // 1) Load the TRA and its deliverables
  const { data: tra, error: traErr } = await c.supabase
    .from("tras")
    .select("*")
    .eq("id", traId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  if (traErr) return { ok: false, error: { code: traErr.code, message: traErr.message } };
  if (!tra) return { ok: false, error: { code: "NOT_FOUND", message: "TRA not found" } };

  if (tra.status === "converted" && tra.converted_to_project_id) {
    return {
      ok: true,
      data: { project_id: tra.converted_to_project_id, task_count: 0 },
    };
  }
  if (tra.status !== "approved") {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Only approved TRAs can be converted to projects.",
      },
    };
  }

  const { data: deliverables, error: dErr } = await c.supabase
    .from("tra_deliverables")
    .select("*")
    .eq("tra_id", traId)
    .eq("org_id", c.orgId)
    .order("created_at");
  if (dErr) return { ok: false, error: { code: dErr.code, message: dErr.message } };
  const deliverableRows = deliverables;

  // 2) Resolve the default bucket from organizations.settings.tra_default_bucket_id
  const { data: org } = await c.supabase
    .from("organizations")
    .select("settings")
    .eq("id", c.orgId)
    .maybeSingle();

  let bucketId: string | null = null;
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const fromSettings = settings["tra_default_bucket_id"];
  if (typeof fromSettings === "string") bucketId = fromSettings;

  // 3) Create the project
  const { data: project, error: pErr } = await c.supabase
    .from("projects")
    .insert({
      org_id: c.orgId,
      department_id: c.departmentId,
      name: tra.project_name,
      description: tra.description,
      bucket_id: bucketId,
      priority: traUrgencyToProjectPriority(tra.urgency as TraUrgency),
      status: "planning",
      total_estimated_hours: tra.total_estimated_hours,
      source_tra_id: tra.id,
    })
    .select()
    .single();

  if (pErr) return { ok: false, error: { code: pErr.code, message: pErr.message } };

  // 4) Create one task per deliverable
  if (deliverableRows.length > 0) {
    const taskRows = deliverableRows.map((d, i) => ({
      org_id: c.orgId,
      department_id: c.departmentId,
      project_id: project.id,
      name: d.name,
      estimated_hours: d.estimated_hours,
      sort_order: i,
    }));
    const { error: tErr } = await c.supabase.from("tasks").insert(taskRows);
    if (tErr) return { ok: false, error: { code: tErr.code, message: tErr.message } };
  }

  // 5) Mark the TRA converted with a back-pointer
  const { error: updErr } = await c.supabase
    .from("tras")
    .update({ status: "converted", converted_to_project_id: project.id })
    .eq("id", traId)
    .eq("org_id", c.orgId);
  if (updErr) return { ok: false, error: { code: updErr.code, message: updErr.message } };

  revalidatePath("/tras");
  revalidatePath(`/tras/${traId}`);
  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);

  return { ok: true, data: { project_id: project.id, task_count: deliverableRows.length } };
}
