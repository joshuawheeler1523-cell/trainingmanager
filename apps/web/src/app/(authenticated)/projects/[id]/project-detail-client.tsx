"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PencilIcon } from "@heroicons/react/20/solid";
import {
  type Instructor,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
  type ProjectTeamMember,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
} from "@arbor/shared";
import ProjectFormDialog from "../project-form-dialog";
import OverviewTab from "./overview-tab";
import TasksTab from "./tasks-tab";
import TeamTab from "./team-tab";
import ActionItemsTab from "./action-items-tab";

type Props = {
  project: Project;
  tasks: Task[];
  team: ProjectTeamMember[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
  instructors: Instructor[];
  percentComplete: number | null;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "gantt", label: "Gantt" },
  { key: "kanban", label: "Kanban" },
  { key: "calendar", label: "Calendar" },
  { key: "team", label: "Team" },
  { key: "milestones", label: "Milestones" },
  { key: "dependencies", label: "Dependencies" },
  { key: "action-items", label: "Action Items" },
  { key: "tra", label: "TRA" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_BADGE: Record<ProjectStatus, string> = {
  planning: "bg-surface text-muted-foreground",
  active: "bg-primary/10 text-primary",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "bg-destructive/10 text-destructive",
};

const PRIORITY_BADGE: Record<ProjectPriority, string> = {
  low: "bg-surface text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-destructive/10 text-destructive",
};

export default function ProjectDetailClient({
  project,
  tasks,
  team,
  assignments,
  actionItems,
  instructors,
  percentComplete,
}: Props) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);

  const instructorMap = useMemo(() => {
    return new Map(instructors.map((i) => [i.id, i]));
  }, [instructors]);

  const teamWithInstructor = useMemo(() => {
    return team.map((m) => ({
      ...m,
      instructor: instructorMap.get(m.instructor_id) ?? null,
    }));
  }, [team, instructorMap]);

  return (
    <div>
      {/* Header */}
      <div className="border-border bg-background border-b px-6 py-4">
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Projects
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-foreground truncate text-xl font-semibold">{project.name}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[project.status]}`}
              >
                {project.status.replace(/_/g, " ")}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_BADGE[project.priority]}`}
              >
                {project.priority}
              </span>
            </div>
            {project.description && (
              <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{project.description}</p>
            )}
            <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
              <span>{formatDateRange(project.start_date, project.end_date)}</span>
              {project.total_estimated_hours != null && (
                <span>{project.total_estimated_hours.toFixed(0)}h estimated</span>
              )}
              <span>{tasks.length.toString()} tasks</span>
              <span>{team.length.toString()} team</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
            }}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-border bg-background sticky top-0 z-10 border-b">
        <nav className="flex flex-wrap gap-x-1 px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
              }}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-primary text-foreground border-b-2"
                  : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="p-6">
        {tab === "overview" && (
          <OverviewTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            percentComplete={percentComplete}
          />
        )}
        {tab === "tasks" && (
          <TasksTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            assignments={assignments}
            actionItems={actionItems}
          />
        )}
        {tab === "team" && (
          <TeamTab project={project} team={teamWithInstructor} instructors={instructors} />
        )}
        {tab === "action-items" && (
          <ActionItemsTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            actionItems={actionItems}
          />
        )}
        {tab === "tra" && <TraTab traId={project.source_tra_id} />}
        {(tab === "gantt" ||
          tab === "kanban" ||
          tab === "calendar" ||
          tab === "milestones" ||
          tab === "dependencies") && <ComingSoonTab tabName={tab} />}
      </div>

      {editing && (
        <ProjectFormDialog
          mode="edit"
          initial={{
            id: project.id,
            name: project.name,
            description: project.description ?? "",
            priority: project.priority,
            status: project.status,
            start_date: project.start_date ?? "",
            end_date: project.end_date ?? "",
            total_estimated_hours: project.total_estimated_hours
              ? project.total_estimated_hours.toString()
              : "",
          }}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function ComingSoonTab({ tabName }: { tabName: string }) {
  return (
    <div className="border-border bg-surface flex flex-col items-center rounded-lg border border-dashed p-12 text-center">
      <p className="text-foreground text-sm font-medium capitalize">{tabName} view</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Coming in a later phase. Tasks, team, and action items already wire through to workload.
      </p>
    </div>
  );
}

function TraTab({ traId }: { traId: string | null }) {
  if (!traId) {
    return (
      <div className="border-border bg-surface flex flex-col items-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-foreground text-sm font-medium">No source TRA</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Projects converted from a TRA will show their source assessment here.
        </p>
      </div>
    );
  }
  return (
    <div className="border-border rounded-lg border p-6">
      <p className="text-foreground text-sm">
        This project was converted from a Training Request Assessment.
      </p>
      <Link
        href={`/tras/${traId}`}
        className="text-primary mt-2 inline-block text-sm hover:underline"
      >
        Open source TRA →
      </Link>
    </div>
  );
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "No dates set";
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString();
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return end ? `Until ${fmt(end)}` : "No dates set";
}
