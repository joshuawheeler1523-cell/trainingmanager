"use client";

import { useState, useTransition } from "react";
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
  type TaskStatus,
} from "@arbor/shared";
import { createTask, deleteTask, updateTask } from "../actions";
import TaskDrawer, { type TeamMemberWithInstructor } from "./task-drawer";

type Props = {
  project: Project;
  tasks: Task[];
  team: TeamMemberWithInstructor[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
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

  return (
    <div className="space-y-3">
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
                <Th className="w-1/2">Task</Th>
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
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        defaultValue={t.percent_complete}
                        disabled={pending}
                        onMouseUp={(e) => {
                          const v = Number((e.target as HTMLInputElement).value);
                          if (v !== t.percent_complete) handlePercentChange(t, v);
                        }}
                        onTouchEnd={(e) => {
                          const v = Number((e.target as HTMLInputElement).value);
                          if (v !== t.percent_complete) handlePercentChange(t, v);
                        }}
                        className="w-20"
                      />
                      <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                        {t.percent_complete.toString()}%
                      </span>
                    </div>
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
          team={team}
          assignments={assignments.filter((a) => a.task_id === openTask.id)}
          actionItems={actionItems.filter((a) => a.task_id === openTask.id)}
          milestones={milestones}
          onClose={() => {
            setOpenTaskId(null);
          }}
        />
      )}
    </div>
  );
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
