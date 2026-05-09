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
  traPriorityToProjectPriority,
  traStakeholderSchema,
  traAudienceRoleSchema,
  traKpiSchema,
  traSuccessCriteriaSchema,
  traObjectiveSchema,
  traSmeSchema,
  traEvaluationPlanSchema,
  traApprovalSchema,
  type Tra,
  type TraDeliverable,
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

// ── tras CRUD ───────────────────────────────────────────────────────────────

export async function createTra(input: unknown): Promise<ActionResult<Tra>> {
  const parsed = traInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const row = stripUndefined({
    ...(parsed.data as Record<string, unknown>),
    org_id: c.orgId,
    department_id: c.departmentId,
  }) as unknown as TablesInsert<"tras">;

  const { data, error } = await c.supabase.from("tras").insert(row).select().single();

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

  const update: TablesUpdate<"tras"> = { status: next };
  if (next === "submitted") {
    update.submitted_at = new Date().toISOString();
  }

  const { data, error } = await c.supabase
    .from("tras")
    .update(update)
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

// ── child-row bulk save ─────────────────────────────────────────────────────
// Each list (stakeholders, KPIs, etc.) is owned by one TRA. The form
// passes the full desired set; we delete rows not in the set and upsert
// the rest. Cleaner than per-row CRUD when the user is editing a list.

async function replaceChildRows<TInput>(
  table:
    | "tra_stakeholders"
    | "tra_audience_roles"
    | "tra_kpis"
    | "tra_success_criteria"
    | "tra_objectives"
    | "tra_smes"
    | "tra_evaluation_plan"
    | "tra_approvals",
  traId: string,
  parsedRows: TInput[],
  buildRow: (input: TInput, c: { orgId: string; departmentId: string }) => Record<string, unknown>,
): Promise<ActionResult<{ count: number }>> {
  const c = await ctx();
  if (!c.ok) return c;

  // Verify the TRA exists in this org/dept
  const { data: tra, error: traErr } = await c.supabase
    .from("tras")
    .select("id")
    .eq("id", traId)
    .eq("org_id", c.orgId)
    .maybeSingle();
  if (traErr) return { ok: false, error: { code: traErr.code, message: traErr.message } };
  if (!tra) return { ok: false, error: { code: "NOT_FOUND", message: "TRA not found" } };

  // Clear existing rows; insert new ones. The simple delete-and-insert is
  // fine here — these tables only contain user-managed metadata, no FK
  // references from elsewhere.
  const { error: delErr } = await c.supabase
    .from(table)
    .delete()
    .eq("tra_id", traId)
    .eq("org_id", c.orgId);
  if (delErr) return { ok: false, error: { code: delErr.code, message: delErr.message } };

  if (parsedRows.length === 0) {
    revalidatePath(`/tras/${traId}`);
    return { ok: true, data: { count: 0 } };
  }

  const rows = parsedRows.map((p) =>
    stripUndefined({
      ...buildRow(p, { orgId: c.orgId, departmentId: c.departmentId }),
      org_id: c.orgId,
      department_id: c.departmentId,
      tra_id: traId,
    }),
  );

  const { error: insErr } = await c.supabase
    .from(table)
    // Casting through unknown: TS can't narrow the dynamic table name into
    // a single Insert<T> shape. Each buildRow returns the matching shape.
    .insert(rows as unknown as TablesInsert<typeof table>[]);
  if (insErr) return { ok: false, error: { code: insErr.code, message: insErr.message } };

  revalidatePath(`/tras/${traId}`);
  return { ok: true, data: { count: rows.length } };
}

export async function saveTraStakeholders(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traStakeholderSchema.parse>[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = traStakeholderSchema.safeParse(input[i]);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_stakeholders", traId, parsed, (p) => ({
    position: p.position,
    name: p.name,
    role: p.role,
    decision_rights: p.decision_rights,
    email: p.email,
  }));
}

export async function saveTraAudienceRoles(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traAudienceRoleSchema.parse>[] = [];
  for (const item of input) {
    const r = traAudienceRoleSchema.safeParse(item);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_audience_roles", traId, parsed, (p) => ({
    position: p.position,
    role: p.role,
    headcount: p.headcount,
  }));
}

export async function saveTraKpis(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traKpiSchema.parse>[] = [];
  for (const item of input) {
    const r = traKpiSchema.safeParse(item);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_kpis", traId, parsed, (p) => ({
    position: p.position,
    metric: p.metric,
    baseline: p.baseline,
    target: p.target,
  }));
}

export async function saveTraSuccessCriteria(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traSuccessCriteriaSchema.parse>[] = [];
  for (const item of input) {
    const r = traSuccessCriteriaSchema.safeParse(item);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_success_criteria", traId, parsed, (p) => ({
    checkpoint: p.checkpoint,
    criteria: p.criteria,
    measurement_owner: p.measurement_owner,
  }));
}

export async function saveTraObjectives(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traObjectiveSchema.parse>[] = [];
  for (const item of input) {
    const r = traObjectiveSchema.safeParse(item);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_objectives", traId, parsed, (p) => ({
    position: p.position,
    text: p.text,
  }));
}

export async function saveTraSmes(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traSmeSchema.parse>[] = [];
  for (const item of input) {
    const r = traSmeSchema.safeParse(item);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_smes", traId, parsed, (p) => ({
    position: p.position,
    name: p.name,
    email: p.email,
    availability_hours: p.availability_hours,
  }));
}

export async function saveTraEvaluationPlan(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traEvaluationPlanSchema.parse>[] = [];
  for (const item of input) {
    const r = traEvaluationPlanSchema.safeParse(item);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_evaluation_plan", traId, parsed, (p) => ({
    kirkpatrick_level: p.kirkpatrick_level,
    measurement_method: p.measurement_method,
  }));
}

export async function saveTraApprovals(
  traId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  if (!Array.isArray(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array" } };
  }
  const parsed: ReturnType<typeof traApprovalSchema.parse>[] = [];
  for (const item of input) {
    const r = traApprovalSchema.safeParse(item);
    if (!r.success) return validationError(r.error);
    parsed.push(r.data);
  }
  return replaceChildRows<(typeof parsed)[number]>("tra_approvals", traId, parsed, (p) => ({
    approval_type: p.approval_type,
    name: p.name,
    signed_at: p.signed_at,
  }));
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

  const { data: org } = await c.supabase
    .from("organizations")
    .select("settings")
    .eq("id", c.orgId)
    .maybeSingle();

  let bucketId: string | null = null;
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const fromSettings = settings["tra_default_bucket_id"];
  if (typeof fromSettings === "string") bucketId = fromSettings;

  const { data: project, error: pErr } = await c.supabase
    .from("projects")
    .insert({
      org_id: c.orgId,
      department_id: c.departmentId,
      name: tra.project_name,
      description: tra.business_problem,
      bucket_id: bucketId,
      priority: traPriorityToProjectPriority(tra.priority as Tra["priority"]),
      status: "planning",
      total_estimated_hours: tra.total_estimated_hours,
      source_tra_id: tra.id,
    })
    .select()
    .single();

  if (pErr) return { ok: false, error: { code: pErr.code, message: pErr.message } };

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
