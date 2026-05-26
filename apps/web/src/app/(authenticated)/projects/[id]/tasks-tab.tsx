"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  TASK_STATUS_VALUES,
  type Milestone,
  type Project,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskDependency,
  type TaskStatus,
} from "@arbor/shared";
import { createTask, deleteTask, updateTask } from "../actions";
import TaskDrawer, { type TeamMemberWithInstructor } from "./task-drawer";
import ImportExportControls from "./import-export";

type Props = {
  project: Project;
  tasks: Task[];
  team: TeamMemberWithInstructor[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
  dependencies: TaskDependency[];
  milestones: Milestone[];
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  not_started: "bg-surface text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
};

export default function TasksTab({
  project,
  tasks,
  team,
  assignments,
  actionItems,
  dependencies,
  milestones,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  function handleCreateTask() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createTask(project.id, { name });
      if (result.ok) {
        toast.success("Task created");
        setNewName("");
        setCreating(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleStatusChange(t: Task, status: TaskStatus) {
    const patch: Record<string, unknown> = { status };
    if (status === "completed") patch["percent_complete"] = 100;
    startTransition(async () => {
      const result = await updateTask(t.id, project.id, patch);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handlePercentChange(t: Task, percent: number) {
    startTransition(async () => {
      const result = await updateTask(t.id, project.id, { percent_complete: percent });
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleDeleteTask(t: Task) {
    startTransition(async () => {
      const result = await deleteTask(t.id, project.id);
      if (result.ok) {
        toast.success("Task deleted");
        if (openTaskId === t.id) setOpenTaskId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const openTask = openTaskId ? (tasks.find((t) => t.id === openTaskId) ?? null) : null;

  const memberNameById = new Map(team.map((m) => [m.id, m.instructor?.full_name ?? "Unknown"]));
  const assigneesByTask = new Map<string, string[]>();
  for (const a of assignments) {
    const list = assigneesByTask.get(a.task_id) ?? [];
    list.push(memberNameById.get(a.project_team_member_id) ?? "Unknown");
    assigneesByTask.set(a.task_id, list);
  }

  return (
    <div className="space-y-3">
      <ImportExportControls project={project} tasks={tasks} />
      {tasks.length === 0 && !creating ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No tasks yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Add the first task to start tracking work.
          </p>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
            className="bg-primary text-primary-foreground mt-3 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            <PlusIcon className="h-4 w-4" />
            New task
          </button>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/3">Task</Th>
                <Th>Assigned</Th>
                <Th>Dates</Th>
                <Th>Status</Th>
                <Th className="w-32">Progress</Th>
                <Th>Hours</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-surface/50">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenTaskId(t.id);
                      }}
                      className="text-primary text-left font-medium hover:underline"
                    >
                      {t.name}
                    </button>
                    {t.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">{t.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {(() => {
                      const names = assigneesByTask.get(t.id) ?? [];
                      if (names.length === 0)
                        return <span className="text-muted-foreground">Unassigned</span>;
                      return (
                        <span className="text-foreground line-clamp-1" title={names.join(", ")}>
                          {names.join(", ")}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap px-3 py-2 text-xs tabular-nums">
                    {formatDateRange(t.start_date, t.end_date)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={t.status}
                      disabled={pending}
                      onChange={(e) => {
                        handleStatusChange(t, e.target.value as TaskStatus);
                      }}
                      className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[t.status]}`}
                    >
                      {TASK_STATUS_VALUES.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <TaskPercentInput
                      value={t.percent_complete}
                      disabled={pending}
                      onCommit={(v) => {
                        handlePercentChange(t, v);
                      }}
                    />
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {t.estimated_hours != null ? `${t.estimated_hours.toFixed(0)}h est` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleDeleteTask(t);
                      }}
                      aria-label="Delete task"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline create */}
      {creating ? (
        <div className="border-border bg-background flex items-center gap-2 rounded-lg border p-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateTask();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder="Task name"
            className="border-input bg-background text-foreground flex-1 rounded-md border px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={pending || !newName.trim()}
            onClick={handleCreateTask}
            className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        tasks.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            <PlusIcon className="h-4 w-4" />
            Add task
          </button>
        )
      )}

      {openTask && (
        <TaskDrawer
          project={project}
          task={openTask}
          allProjectTasks={tasks}
          team={team}
          assignments={assignments.filter((a) => a.task_id === openTask.id)}
          actionItems={actionItems.filter((a) => a.task_id === openTask.id)}
          dependencies={dependencies}
          milestones={milestones}
          onClose={() => {
            setOpenTaskId(null);
          }}
        />
      )}
    </div>
  );
}

// Date-only strings (YYYY-MM-DD) are parsed component-wise to avoid a UTC
// midnight shifting the displayed day backwards in negative-offset zones.
function formatDate(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateRange(start: string | null, end: string | null): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (!s && !e) return "—";
  return `${s ?? "—"} → ${e ?? "—"}`;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

/**
 * Slider + number input for task completion %. Either control commits via
 * onCommit. Slider commits on release; number commits on blur or Enter.
 * Both are controlled and stay in sync with the parent's value (so a
 * router.refresh() updates them).
 */
function TaskPercentInput({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<number>(value);

  // Sync if the parent's value changes (e.g. after router.refresh()).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function clamp(n: number): number {
    if (!Number.isFinite(n)) return value;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(Number(e.target.value));
        }}
        onPointerUp={() => {
          if (draft !== value) onCommit(draft);
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" && draft !== value) onCommit(draft);
        }}
        className="w-20"
        aria-label="Percent complete"
      />
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(Number(e.target.value));
        }}
        onBlur={() => {
          const next = clamp(draft);
          setDraft(next);
          if (next !== value) onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        className="border-input bg-background text-foreground focus:ring-ring w-14 rounded-md border px-1.5 py-0.5 text-right text-xs tabular-nums focus:outline-none focus:ring-1"
        aria-label="Percent complete (numeric)"
      />
      <span className="text-muted-foreground text-xs">%</span>
    </div>
  );
}
