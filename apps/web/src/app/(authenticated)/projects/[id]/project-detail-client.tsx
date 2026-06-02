"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeftIcon, PencilIcon } from "@heroicons/react/20/solid";
import {
  type ExternalDependency,
  type Instructor,
  type Milestone,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
  type ProjectTeamMember,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskDependency,
} from "@arbor/shared";
import { useIsNarrow } from "@/lib/use-media-query";
import { Badge, Eyebrow, Tabs, type BadgeVariant, type TabItem } from "@/components/ui";
import { ReadOnlyBanner } from "@/components/auth/read-only-context";
import ProjectFormDialog from "../project-form-dialog";
import OverviewTab from "./overview-tab";
import TasksTab from "./tasks-tab";
import TeamTab from "./team-tab";
import ActionItemsTab from "./action-items-tab";
import MilestonesTab from "./milestones-tab";
import DependenciesTab from "./dependencies-tab";

// Heavy tabs are lazy-loaded — Gantt is a custom SVG renderer, Kanban
// pulls dnd-kit, Calendar pulls react-big-calendar + its CSS. Users land
// on Overview by default, so these are off the critical path.
const TabLoading = () => <div className="text-muted-foreground p-6 text-sm">Loading…</div>;
const GanttTab = dynamic(() => import("./gantt-tab"), {
  ssr: false,
  loading: TabLoading,
});
const KanbanTab = dynamic(() => import("./kanban-tab"), {
  ssr: false,
  loading: TabLoading,
});
const CalendarTab = dynamic(() => import("./calendar-tab"), {
  ssr: false,
  loading: TabLoading,
});

type Props = {
  project: Project;
  tasks: Task[];
  team: ProjectTeamMember[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
  instructors: Instructor[];
  milestones: Milestone[];
  dependencies: TaskDependency[];
  externalDeps: ExternalDependency[];
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
  { key: "tra", label: "Source Intake" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_VARIANT: Record<ProjectStatus, BadgeVariant> = {
  planning: "neutral",
  active: "info",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
};

const PRIORITY_VARIANT: Record<ProjectPriority, BadgeVariant> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Complete",
  cancelled: "Cancelled",
};

const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export default function ProjectDetailClient({
  project,
  tasks,
  team,
  assignments,
  actionItems,
  instructors,
  milestones,
  dependencies,
  externalDeps,
  percentComplete,
}: Props) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const isNarrow = useIsNarrow();

  const instructorMap = useMemo(() => {
    return new Map(instructors.map((i) => [i.id, i]));
  }, [instructors]);

  const teamWithInstructor = useMemo(() => {
    return team.map((m) => ({
      ...m,
      instructor: instructorMap.get(m.instructor_id) ?? null,
    }));
  }, [team, instructorMap]);

  // Mobile fallback: Gantt and Calendar are too wide on narrow screens, so
  // we render Kanban instead. The active tab pill keeps the user's intent
  // visible — switching the page back to a wider screen restores the view.
  const effectiveTab: TabKey = isNarrow && (tab === "gantt" || tab === "calendar") ? "kanban" : tab;

  const tabItems: TabItem<TabKey>[] = TABS.map((t) => ({ id: t.key, label: t.label }));

  return (
    <div>
      <div className="px-6 pt-4">
        <ReadOnlyBanner />
      </div>
      {/* Header — editorial Eyebrow breadcrumb + serif title + Badges */}
      <div className="border-border bg-background border-b px-6 py-5">
        <Link
          href="/projects"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Projects
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Eyebrow className="mb-2">Project</Eyebrow>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-foreground truncate text-2xl font-medium leading-tight tracking-[-0.005em]">
                {project.name}
              </h1>
              <Badge variant={STATUS_VARIANT[project.status]}>{STATUS_LABEL[project.status]}</Badge>
              <Badge variant={PRIORITY_VARIANT[project.priority]}>
                {PRIORITY_LABEL[project.priority]}
              </Badge>
            </div>
            {project.description && (
              <p className="text-muted-foreground mt-2 max-w-3xl text-sm">{project.description}</p>
            )}
            <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.04em]">
              <span className="normal-case tabular-nums">
                {formatDateRange(project.start_date, project.end_date)}
              </span>
              {project.total_estimated_hours != null && (
                <span>
                  Estimated ·{" "}
                  <b className="text-foreground font-medium normal-case tabular-nums">
                    {project.total_estimated_hours.toFixed(0)} h
                  </b>
                </span>
              )}
              <span>
                Tasks · <b className="text-foreground font-medium tabular-nums">{tasks.length}</b>
              </span>
              <span>
                Team · <b className="text-foreground font-medium tabular-nums">{team.length}</b>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
            }}
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs<TabKey>
        tabs={tabItems}
        value={tab}
        onChange={(id) => {
          setTab(id);
        }}
        paddingX="px-4"
        className="sticky top-0 z-10"
      />

      {/* Mobile fallback notice */}
      {isNarrow && (tab === "gantt" || tab === "calendar") && (
        <div className="bg-warning-bg text-warning px-6 py-2 text-xs">
          {tab === "gantt" ? "Gantt" : "Calendar"} is unavailable at this width — showing Kanban
          instead.
        </div>
      )}

      {/* Body */}
      <div className="p-6">
        {effectiveTab === "overview" && (
          <OverviewTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            percentComplete={percentComplete}
          />
        )}
        {effectiveTab === "tasks" && (
          <TasksTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            assignments={assignments}
            actionItems={actionItems}
            dependencies={dependencies}
            milestones={milestones}
          />
        )}
        {effectiveTab === "gantt" && (
          <GanttTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            assignments={assignments}
            actionItems={actionItems}
            milestones={milestones}
            dependencies={dependencies}
          />
        )}
        {effectiveTab === "kanban" && (
          <KanbanTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            assignments={assignments}
            actionItems={actionItems}
            dependencies={dependencies}
            milestones={milestones}
          />
        )}
        {effectiveTab === "calendar" && (
          <CalendarTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            assignments={assignments}
            actionItems={actionItems}
            dependencies={dependencies}
            milestones={milestones}
          />
        )}
        {effectiveTab === "team" && (
          <TeamTab project={project} team={teamWithInstructor} instructors={instructors} />
        )}
        {effectiveTab === "milestones" && (
          <MilestonesTab project={project} milestones={milestones} />
        )}
        {effectiveTab === "dependencies" && (
          <DependenciesTab project={project} dependencies={externalDeps} />
        )}
        {effectiveTab === "action-items" && (
          <ActionItemsTab
            project={project}
            tasks={tasks}
            team={teamWithInstructor}
            actionItems={actionItems}
          />
        )}
        {effectiveTab === "tra" && <TraTab traId={project.source_tra_id} />}
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

function TraTab({ traId }: { traId: string | null }) {
  if (!traId) {
    return (
      <div className="border-border bg-surface flex flex-col items-center rounded-lg border border-dashed p-12 text-center">
        <p className="text-foreground text-sm font-medium">No source intake</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Projects converted from a work intake will show their source assessment here.
        </p>
      </div>
    );
  }
  return (
    <div className="border-border rounded-lg border p-6">
      <p className="text-foreground text-sm">This project was converted from a work intake.</p>
      <Link
        href={`/tras/${traId}`}
        className="text-primary mt-2 inline-block text-sm hover:underline"
      >
        Open source intake →
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
