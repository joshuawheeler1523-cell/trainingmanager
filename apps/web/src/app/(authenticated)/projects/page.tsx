import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import ProjectsView from "./projects-view";
import { projectPercentComplete, type Project, type Task } from "@arbor/shared";

export default async function ProjectsPage() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Special Projects" description="Training initiatives and project work." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [{ data: projects }, { data: tasks }] = await Promise.all([
    applyDeptScope(
      supabase
        .from("projects")
        .select("*")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      scope,
    ),
    applyDeptScope(
      supabase.from("tasks").select("project_id, status, percent_complete").eq("org_id", orgId),
      scope,
    ),
  ]);

  const projectsList = (projects ?? []) as Project[];
  const tasksList = (tasks ?? []) as Pick<Task, "project_id" | "status" | "percent_complete">[];

  const tasksByProject = new Map<string, typeof tasksList>();
  for (const t of tasksList) {
    const list = tasksByProject.get(t.project_id) ?? [];
    list.push(t);
    tasksByProject.set(t.project_id, list);
  }

  const enriched = projectsList.map((p) => {
    const projectTasks = tasksByProject.get(p.id) ?? [];
    return {
      ...p,
      task_count: projectTasks.length,
      percent_complete: projectPercentComplete(projectTasks),
    };
  });

  return (
    <div>
      <PageHeader
        title="Special Projects"
        description="Training initiatives. Manage tasks, team, and milestones in one place."
      />
      <ProjectsView projects={enriched} />
    </div>
  );
}
