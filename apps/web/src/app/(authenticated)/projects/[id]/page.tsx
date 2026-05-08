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
    supabase.from("task_assignments").select("*").eq("org_id", orgId),
    supabase.from("task_action_items").select("*").eq("org_id", orgId).order("sort_order"),
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", id)
      .eq("org_id", orgId)
      .order("due_date"),
    supabase.from("task_dependencies").select("*").eq("org_id", orgId),
    supabase
      .from("dependencies")
      .select("*")
      .eq("project_id", id)
      .eq("org_id", orgId)
      .order("sort_order"),
  ]);

  const tasksList = (tasks ?? []) as Task[];
  const teamList = (teamMembers ?? []) as ProjectTeamMember[];
  const assignmentsAll = (taskAssignments ?? []) as TaskAssignment[];
  const actionItemsAll = (actionItems ?? []) as TaskActionItem[];
  const instructorList = (instructors ?? []) as Instructor[];
  const milestonesList = (milestones ?? []) as Milestone[];
  const dependenciesAll = (dependencies ?? []) as TaskDependency[];
  const externalDepList = (externalDeps ?? []) as ExternalDependency[];

  const taskIds = new Set(tasksList.map((t) => t.id));
  const projectAssignments = assignmentsAll.filter((a) => taskIds.has(a.task_id));
  const projectActionItems = actionItemsAll.filter((a) => taskIds.has(a.task_id));
  // Dependencies belong to this project iff both endpoints are in its task set.
  const projectDependencies = dependenciesAll.filter(
    (d) => taskIds.has(d.predecessor_id) && taskIds.has(d.successor_id),
  );

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
