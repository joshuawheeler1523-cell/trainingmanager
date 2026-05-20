"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { getCurrentRole } from "@/lib/auth/role";
import {
  projectInsertSchema,
  projectUpdateSchema,
  teamMemberInsertSchema,
  teamMemberUpdateSchema,
  taskInsertSchema,
  taskUpdateSchema,
  taskAssignmentInsertSchema,
  taskAssignmentUpdateSchema,
  actionItemInsertSchema,
  actionItemUpdateSchema,
  milestoneInsertSchema,
  milestoneUpdateSchema,
  dependencyInsertSchema,
  externalDepInsertSchema,
  externalDepUpdateSchema,
  type Project,
  type ProjectTeamMember,
  type Task,
  type TaskAssignment,
  type TaskActionItem,
  type Milestone,
  type TaskDependency,
  type ExternalDependency,
  type ImportRow,
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
  // Project mutations are manager + instructor. Row-level scoping happens
  // in RLS (e.g. instructors can only touch projects they're a member of).
  // Viewers are blocked here so they fail fast with a clean error.
  const role = await getCurrentRole(orgId);
  if (role !== "manager" && role !== "instructor") {
    return { ok: false as const, error: { code: "FORBIDDEN", message: "Permission denied" } };
  }
  return { ok: true as const, supabase, orgId, departmentId };
}

function revalidateProject(id?: string) {
  revalidatePath("/projects");
  if (id) revalidatePath(`/projects/${id}`);
}

// ── projects ────────────────────────────────────────────────────────────────

export async function createProject(input: unknown): Promise<ActionResult<Project>> {
  const parsed = projectInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("projects")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(data.id);
  return { ok: true, data: data as Project };
}

export async function updateProject(id: string, input: unknown): Promise<ActionResult<Project>> {
  const parsed = projectUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("projects")
    .update(
      stripUndefined(parsed.data as Record<string, unknown>) as unknown as TablesUpdate<"projects">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(id);
  return { ok: true, data: data as Project };
}

export async function archiveProject(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(id);
  return { ok: true, data: { id } };
}

// ── project_team_members ────────────────────────────────────────────────────

export async function addTeamMember(
  projectId: string,
  input: unknown,
): Promise<ActionResult<ProjectTeamMember>> {
  const parsed = teamMemberInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("project_team_members")
    .insert({
      org_id: c.orgId,
      department_id: c.departmentId,
      project_id: projectId,
      instructor_id: parsed.data.instructor_id,
      role: parsed.data.role,
      allocated_hours: parsed.data.allocated_hours,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: data as ProjectTeamMember };
}

export async function updateTeamMember(
  memberId: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<ProjectTeamMember>> {
  const parsed = teamMemberUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("project_team_members")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"project_team_members">,
    )
    .eq("id", memberId)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: data as ProjectTeamMember };
}

export async function removeTeamMember(
  memberId: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("project_team_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id: memberId } };
}

// ── tasks ───────────────────────────────────────────────────────────────────

export async function createTask(projectId: string, input: unknown): Promise<ActionResult<Task>> {
  const parsed = taskInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("tasks")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      department_id: c.departmentId,
      project_id: projectId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: data as Task };
}

export async function updateTask(
  id: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<Task>> {
  const parsed = taskUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("tasks")
    .update(
      stripUndefined(parsed.data as Record<string, unknown>) as unknown as TablesUpdate<"tasks">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: data as Task };
}

export async function deleteTask(
  id: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase.from("tasks").delete().eq("id", id).eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id } };
}

// ── task_assignments ────────────────────────────────────────────────────────

export async function assignTaskMember(
  taskId: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<TaskAssignment>> {
  const parsed = taskAssignmentInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("task_assignments")
    .upsert(
      {
        org_id: c.orgId,
        department_id: c.departmentId,
        task_id: taskId,
        project_team_member_id: parsed.data.project_team_member_id,
        allocated_hours: parsed.data.allocated_hours,
      },
      { onConflict: "task_id,project_team_member_id" },
    )
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data };
}

export async function updateTaskAssignment(
  assignmentId: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<TaskAssignment>> {
  const parsed = taskAssignmentUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("task_assignments")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"task_assignments">,
    )
    .eq("id", assignmentId)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data };
}

export async function unassignTaskMember(
  assignmentId: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("task_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id: assignmentId } };
}

// ── task_action_items ───────────────────────────────────────────────────────

export async function createActionItem(
  taskId: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<TaskActionItem>> {
  const parsed = actionItemInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("task_action_items")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId, task_id: taskId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data };
}

export async function updateActionItem(
  id: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<TaskActionItem>> {
  const parsed = actionItemUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("task_action_items")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"task_action_items">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data };
}

export async function deleteActionItem(
  id: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("task_action_items")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id } };
}

// ── milestones ──────────────────────────────────────────────────────────────

export async function createMilestone(
  projectId: string,
  input: unknown,
): Promise<ActionResult<Milestone>> {
  const parsed = milestoneInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("milestones")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      department_id: c.departmentId,
      project_id: projectId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data };
}

export async function updateMilestone(
  id: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<Milestone>> {
  const parsed = milestoneUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("milestones")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"milestones">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data };
}

export async function deleteMilestone(
  id: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase.from("milestones").delete().eq("id", id).eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id } };
}

// ── task_dependencies ──────────────────────────────────────────────────────

export async function createDependency(
  projectId: string,
  input: unknown,
): Promise<ActionResult<TaskDependency>> {
  const parsed = dependencyInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("task_dependencies")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: data as TaskDependency };
}

export async function deleteDependency(
  id: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("task_dependencies")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id } };
}

// ── external dependencies ──────────────────────────────────────────────────

export async function createExternalDep(
  projectId: string,
  input: unknown,
): Promise<ActionResult<ExternalDependency>> {
  const parsed = externalDepInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("dependencies")
    .insert({
      ...parsed.data,
      org_id: c.orgId,
      department_id: c.departmentId,
      project_id: projectId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: data as ExternalDependency };
}

export async function updateExternalDep(
  id: string,
  projectId: string,
  input: unknown,
): Promise<ActionResult<ExternalDependency>> {
  const parsed = externalDepUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("dependencies")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"dependencies">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: data as ExternalDependency };
}

export async function deleteExternalDep(
  id: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("dependencies")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id } };
}

// ── public share token ─────────────────────────────────────────────────────

export async function generateShareToken(
  projectId: string,
): Promise<ActionResult<{ token: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  // Generate a UUID client-side so we can return it without an extra select.
  const token = crypto.randomUUID();

  const { error } = await c.supabase
    .from("projects")
    .update({ public_share_token: token })
    .eq("id", projectId)
    .eq("org_id", c.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { token } };
}

export async function revokeShareToken(projectId: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("projects")
    .update({ public_share_token: null })
    .eq("id", projectId)
    .eq("org_id", c.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  return { ok: true, data: { id: projectId } };
}

// ── transactional task import (Excel round-trip) ───────────────────────────

export async function commitTaskImport(
  projectId: string,
  args: {
    inserts: ImportRow[];
    updates: { id: string; row: ImportRow }[];
    deleteIds: string[];
  },
): Promise<ActionResult<{ inserted: number; updated: number; deleted: number }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const insertsForRpc = args.inserts.map((r) => ({
    name: r.name,
    description: r.description,
    status: r.status,
    priority: r.priority,
    start_date: r.start_date,
    end_date: r.end_date,
    estimated_hours: r.estimated_hours,
    percent_complete: r.percent_complete,
  }));

  const updatesForRpc = args.updates.map((u) => ({
    id: u.id,
    name: u.row.name,
    description: u.row.description,
    status: u.row.status,
    priority: u.row.priority,
    start_date: u.row.start_date,
    end_date: u.row.end_date,
    estimated_hours: u.row.estimated_hours,
    percent_complete: u.row.percent_complete,
  }));

  const { data, error } = await c.supabase.rpc("import_tasks", {
    p_project_id: projectId,
    p_inserts: insertsForRpc,
    p_updates: updatesForRpc,
    p_delete_ids: args.deleteIds,
  });

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidateProject(projectId);
  const result = data as { inserted: number; updated: number; deleted: number };
  return { ok: true, data: result };
}
