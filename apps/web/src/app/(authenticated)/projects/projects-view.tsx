"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import { Badge, Eyebrow, type BadgeVariant } from "@/components/ui";
import { cn } from "@/lib/utils";
import ProjectFormDialog from "./project-form-dialog";
import { RoleGate } from "@/components/auth/role-gate";
import {
  PROJECT_STATUS_VALUES,
  PROJECT_PRIORITY_VALUES,
  type Project,
  type ProjectPriority,
  type ProjectStatus,
} from "@arbor/shared";
import { archiveProject } from "./actions";

type ProjectRow = Project & {
  task_count: number;
  percent_complete: number | null;
};

type Props = { projects: ProjectRow[] };

const STATUS_VARIANT: Record<ProjectStatus, BadgeVariant> = {
  planning: "neutral",
  active: "info",
  on_hold: "warning",
  completed: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Complete",
  cancelled: "Cancelled",
};

const PRIORITY_VARIANT: Record<ProjectPriority, BadgeVariant> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export default function ProjectsView({ projects }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<ProjectPriority | "all">("all");
  const [openCreate, setOpenCreate] = useState(false);

  function handleDelete(p: ProjectRow) {
    if (
      !confirm(
        `Delete project "${p.name}"? It will be archived and removed from this list. Tasks, milestones, and team rows inside it stay in the database (soft delete).`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await archiveProject(p.id);
      if (result.ok) {
        toast.success(`"${p.name}" deleted`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (priorityFilter !== "all" && p.priority !== priorityFilter) return false;
      return true;
    });
  }, [projects, statusFilter, priorityFilter]);

  // Editorial footer summary line.
  const summary = useMemo(() => {
    const active = filtered.filter((p) => p.status === "active").length;
    const planning = filtered.filter((p) => p.status === "planning").length;
    const tasks = filtered.reduce((s, p) => s + p.task_count, 0);
    return { active, planning, tasks };
  }, [filtered]);

  const statusChips: { value: ProjectStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    ...PROJECT_STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
  ];

  return (
    <div className="space-y-5 p-6">
      {/* Status chip row + new-project action */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Eyebrow variant="section">Filter</Eyebrow>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusChips.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  setStatusFilter(c.value);
                }}
                aria-pressed={statusFilter === c.value}
                className={cn(
                  "rounded-[3px] px-2 py-1 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em] transition-colors",
                  statusFilter === c.value
                    ? "bg-[var(--ink,var(--foreground))] text-[var(--cream,var(--background))]"
                    : "bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <RoleGate roles={["manager", "instructor"]}>
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
        </RoleGate>
      </div>

      {/* Priority filter, secondary */}
      <div className="border-border flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="flex flex-col gap-1.5">
          <Eyebrow variant="section">Priority</Eyebrow>
          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as ProjectPriority | "all");
            }}
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs"
          >
            <option value="all">All</option>
            {PROJECT_PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
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
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border border-b border-dashed">
              <tr>
                <Th className="w-1/3">Project</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Dates</Th>
                <Th className="w-48">Progress</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-display text-foreground text-base font-medium leading-tight hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.description && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-1 font-mono text-[10.5px] tracking-[0.02em]">
                        {p.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={PRIORITY_VARIANT[p.priority]}>
                      {PRIORITY_LABEL[p.priority]}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-[10.5px] tabular-nums">
                    {formatDateRange(p.start_date, p.end_date)}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar percent={p.percent_complete} taskCount={p.task_count} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleDelete(p);
                      }}
                      aria-label={`Delete ${p.name}`}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Editorial footer summary */}
          <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t border-dashed px-4 py-3 font-mono text-[10.5px] tracking-[0.04em]">
            <span>
              {filtered.length} shown ·{" "}
              <b className="text-foreground font-medium">{summary.tasks}</b> tasks total
              {summary.active > 0 && <> · {summary.active} active</>}
            </span>
            {summary.planning > 0 && (
              <span>
                <b className="text-foreground font-medium">{summary.planning}</b> in planning
              </span>
            )}
          </div>
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

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "text-muted-foreground px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        className,
      )}
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
      <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-[var(--hair-soft,rgba(28,31,28,0.06))]">
        <div
          className="h-full bg-[var(--forest,var(--primary))]"
          style={{ width: `${p.toString()}%` }}
        />
      </div>
      <span className="text-muted-foreground w-12 shrink-0 text-right font-mono text-[10.5px] tabular-nums">
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
