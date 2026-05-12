import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import ProjectDetailClient from "./project-detail-client";
import {
  projectPercentComplete,
  type ExternalDependency,
  type Instructor,
  type Milestone,
  type Project,
  type ProjectTeamMember,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskDependency,
} from "@arbor/shared";

type Params = Promise<{ id: string }>;

export default async function ProjectDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const [
    { data: tasks },
    { data: teamMembers },
    { data: taskAssignments },
    { data: actionItems },
    { data: instructors },
    { data: milestones },
    { data: dependencies },
    { data: externalDeps },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("project_id", id)
      .eq("org_id", orgId)
      .order("sort_order")
      .order("created_at"),
    supabase.from("project_team_members").select("*").eq("project_id", id).eq("org_id", orgId),
    // Inner-join filter through tasks so we only fetch rows for this
    // project. Without the join, every row in the org came back and was
    // filtered client-side — fine for tiny demos, painful for real orgs.
    supabase
      .from("task_assignments")
      .select("*, task:tasks!inner(project_id)")
      .eq("org_id", orgId)
      .eq("task.project_id", id),
    supabase
      .from("task_action_items")
      .select("*, task:tasks!inner(project_id)")
      .eq("org_id", orgId)
      .eq("task.project_id", id)
      .order("sort_order"),
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", id)
      .eq("org_id", orgId)
      .order("due_date"),
    // Dependencies are scoped via the predecessor task — both endpoints
    // are constrained to tasks within the same project by the data model,
    // so filtering on predecessor.project_id is sufficient.
    supabase
      .from("task_dependencies")
      .select("*, predecessor:tasks!task_dependencies_predecessor_id_fkey!inner(project_id)")
      .eq("org_id", orgId)
      .eq("predecessor.project_id", id),
    supabase
      .from("dependencies")
      .select("*")
      .eq("project_id", id)
      .eq("org_id", orgId)
      .order("sort_order"),
  ]);

  const tasksList = (tasks ?? []) as Task[];
  const teamList = (teamMembers ?? []) as ProjectTeamMember[];
  const projectAssignments = (taskAssignments ?? []) as TaskAssignment[];
  const projectActionItems = (actionItems ?? []) as TaskActionItem[];
  const instructorList = (instructors ?? []) as Instructor[];
  const milestonesList = (milestones ?? []) as Milestone[];
  const projectDependencies = (dependencies ?? []) as TaskDependency[];
  const externalDepList = (externalDeps ?? []) as ExternalDependency[];

  const percentComplete = projectPercentComplete(tasksList);

  return (
    <ProjectDetailClient
      project={project as Project}
      tasks={tasksList}
      team={teamList}
      assignments={projectAssignments}
      actionItems={projectActionItems}
      instructors={instructorList}
      milestones={milestonesList}
      dependencies={projectDependencies}
      externalDeps={externalDepList}
      percentComplete={percentComplete}
    />
  );
}
