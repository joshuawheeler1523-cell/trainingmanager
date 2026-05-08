"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import ProjectFormDialog from "./project-form-dialog";
import {
  PROJECT_STATUS_VALUES,
  PROJECT_PRIORITY_VALUES,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
} from "@arbor/shared";

type ProjectRow = Project & {
  task_count: number;
  percent_complete: number | null;
};

type Props = { projects: ProjectRow[] };

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

export default function ProjectsView({ projects }: Props) {
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<ProjectPriority | "all">("all");
  const [openCreate, setOpenCreate] = useState(false);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (priorityFilter !== "all" && p.priority !== priorityFilter) return false;
      return true;
    });
  }, [projects, statusFilter, priorityFilter]);

  const inputCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs";

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Status</p>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as ProjectStatus | "all");
              }}
              className={`${inputCls} capitalize`}
            >
              <option value="all">All</option>
              {PROJECT_STATUS_VALUES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Priority</p>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value as ProjectPriority | "all");
              }}
              className={`${inputCls} capitalize`}
            >
              <option value="all">All</option>
              {PROJECT_PRIORITY_VALUES.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenCreate(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <PlusIcon className="h-4 w-4" />
          New project
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={projects.length === 0 ? "No projects yet" : "No projects match these filters"}
          description={
            projects.length === 0
              ? "Create a project to start tracking tasks, team, and milestones."
              : "Try changing the status or priority filters."
          }
        />
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/3">Project</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Dates</Th>
                <Th className="w-48">Progress</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-surface/50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/projects/${p.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">{p.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[p.status]}`}
                    >
                      {p.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_BADGE[p.priority]}`}
                    >
                      {p.priority}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {formatDateRange(p.start_date, p.end_date)}
                  </td>
                  <td className="px-3 py-2">
                    <ProgressBar percent={p.percent_complete} taskCount={p.task_count} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openCreate && (
        <ProjectFormDialog
          mode="create"
          onClose={() => {
            setOpenCreate(false);
          }}
        />
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`bg-surface px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function ProgressBar({ percent, taskCount }: { percent: number | null; taskCount: number }) {
  if (taskCount === 0) {
    return <span className="text-muted-foreground text-xs">No tasks</span>;
  }
  const p = percent ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="bg-surface h-2 flex-1 overflow-hidden rounded-full">
        <div className="bg-primary h-full" style={{ width: `${p.toString()}%` }} />
      </div>
      <span className="text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums">
        {p.toString()}%
      </span>
    </div>
  );
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString();
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return end ? `Until ${fmt(end)}` : "—";
}
