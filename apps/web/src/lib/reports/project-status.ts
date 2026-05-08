import {
  projectPercentComplete,
  type ProjectStatusDataset,
  type ProjectStatusReportFilters,
} from "@arbor/shared";
import type { TypedSupabase } from "./types";

// Project Status Report (User Guide §12.2): cross-project rollup with
// status, % complete, milestone progress, and overdue task count.

export async function queryProjectStatusReport(
  supabase: TypedSupabase,
  orgId: string,
  filters: ProjectStatusReportFilters,
): Promise<ProjectStatusDataset> {
  const [{ data: projects }, { data: tasks }, { data: milestones }] = await Promise.all([
    supabase.from("projects").select("*").eq("org_id", orgId).is("deleted_at", null),
    supabase
      .from("tasks")
      .select("id, project_id, status, percent_complete, end_date")
      .eq("org_id", orgId),
    supabase.from("milestones").select("id, project_id, is_complete, due_date").eq("org_id", orgId),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const tasksByProject = new Map<
    string,
    { id: string; status: string; percent_complete: number; end_date: string | null }[]
  >();
  for (const t of (tasks ?? []) as {
    id: string;
    project_id: string;
    status: string;
    percent_complete: number;
    end_date: string | null;
  }[]) {
    const list = tasksByProject.get(t.project_id) ?? [];
    list.push(t);
    tasksByProject.set(t.project_id, list);
  }

  const milestonesByProject = new Map<
    string,
    { id: string; is_complete: boolean; due_date: string }[]
  >();
  for (const m of (milestones ?? []) as {
    id: string;
    project_id: string;
    is_complete: boolean;
    due_date: string;
  }[]) {
    const list = milestonesByProject.get(m.project_id) ?? [];
    list.push(m);
    milestonesByProject.set(m.project_id, list);
  }

  const allowedStatus = new Set(filters.status);
  const allowedPriority = filters.priority.length > 0 ? new Set(filters.priority) : null;

  const rows: ProjectStatusDataset["rows"] = [];
  for (const p of (projects ?? []) as {
    id: string;
    name: string;
    status: string;
    priority: string;
    start_date: string | null;
    end_date: string | null;
  }[]) {
    if (filters.status.length > 0 && !allowedStatus.has(p.status as never)) continue;
    if (allowedPriority && !allowedPriority.has(p.priority as never)) continue;
    const projTasks = tasksByProject.get(p.id) ?? [];
    const projMilestones = milestonesByProject.get(p.id) ?? [];
    const overdue = projTasks.filter(
      (t) => t.end_date && t.end_date < today && t.status !== "completed",
    ).length;
    rows.push({
      project_id: p.id,
      name: p.name,
      status: p.status,
      priority: p.priority,
      start_date: p.start_date,
      end_date: p.end_date,
      percent_complete: projectPercentComplete(projTasks),
      task_count: projTasks.length,
      overdue_task_count: overdue,
      milestone_count: projMilestones.length,
      milestones_complete: projMilestones.filter((m) => m.is_complete).length,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows };
}
