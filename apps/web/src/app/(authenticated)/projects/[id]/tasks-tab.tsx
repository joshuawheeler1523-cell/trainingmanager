"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  TASK_STATUS_VALUES,
  type Instructor,
  type Project,
  type ProjectTeamMember,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskStatus,
} from "@arbor/shared";
import {
  createTask,
  deleteTask,
  updateTask,
  assignTaskMember,
  unassignTaskMember,
  createActionItem,
  deleteActionItem,
  updateActionItem,
} from "../actions";

type TeamMember = ProjectTeamMember & { instructor: Instructor | null };

type Props = {
  project: Project;
  tasks: Task[];
  team: TeamMember[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  not_started: "bg-surface text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
};

export default function TasksTab({ project, tasks, team, assignments, actionItems }: Props) {
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
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handlePercentChange(t: Task, percent: number) {
    startTransition(async () => {
      const result = await updateTask(t.id, project.id, { percent_complete: percent });
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
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
  const openTaskAssignments = openTask ? assignments.filter((a) => a.task_id === openTask.id) : [];
  const openTaskActionItems = openTask ? actionItems.filter((a) => a.task_id === openTask.id) : [];

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
                <Th className="w-12"></Th>
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
          assignments={openTaskAssignments}
          actionItems={openTaskActionItems}
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

// ── Task drawer (assignments + action items) ────────────────────────────────

function TaskDrawer({
  project,
  task,
  team,
  assignments,
  actionItems,
  onClose,
}: {
  project: Project;
  task: Task;
  team: TeamMember[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const assignedIds = new Set(assignments.map((a) => a.project_team_member_id));
  const availableMembers = team.filter((m) => !assignedIds.has(m.id));

  const [pickMember, setPickMember] = useState("");
  const [pickHours, setPickHours] = useState(0);

  const [newItem, setNewItem] = useState("");

  function memberName(memberId: string) {
    const m = team.find((x) => x.id === memberId);
    return m?.instructor?.full_name ?? "Unknown";
  }

  function handleAddAssignment() {
    if (!pickMember) return;
    startTransition(async () => {
      const result = await assignTaskMember(task.id, project.id, {
        project_team_member_id: pickMember,
        allocated_hours: pickHours,
      });
      if (result.ok) {
        toast.success("Member assigned");
        setPickMember("");
        setPickHours(0);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemoveAssignment(id: string) {
    startTransition(async () => {
      const result = await unassignTaskMember(id, project.id);
      if (result.ok) {
        toast.success("Removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleCreateActionItem() {
    const description = newItem.trim();
    if (!description) return;
    startTransition(async () => {
      const result = await createActionItem(task.id, project.id, { description });
      if (result.ok) {
        setNewItem("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleToggleActionItem(item: TaskActionItem) {
    startTransition(async () => {
      const result = await updateActionItem(item.id, project.id, {
        is_complete: !item.is_complete,
      });
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDeleteActionItem(id: string) {
    startTransition(async () => {
      const result = await deleteActionItem(id, project.id);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="border-border bg-background flex w-full max-w-xl flex-col border-l shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="border-border flex items-start justify-between border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-foreground truncate text-base font-semibold">{task.name}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs capitalize">
              {task.status.replace(/_/g, " ")} · {task.percent_complete.toString()}%
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {task.description && (
            <section>
              <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                Description
              </h3>
              <p className="text-foreground whitespace-pre-wrap text-sm">{task.description}</p>
            </section>
          )}

          {/* Assignments */}
          <section>
            <h3 className="text-foreground mb-2 text-sm font-semibold">
              Assigned ({assignments.length.toString()})
            </h3>
            {assignments.length === 0 ? (
              <p className="text-muted-foreground text-xs">No team members assigned yet.</p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-md border">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-foreground">{memberName(a.project_team_member_id)}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {a.allocated_hours.toFixed(1)}h
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          handleRemoveAssignment(a.id);
                        }}
                        aria-label="Remove assignment"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {availableMembers.length > 0 && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Add member</p>
                  <select
                    value={pickMember}
                    onChange={(e) => {
                      setPickMember(e.target.value);
                    }}
                    className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
                  >
                    <option value="">Select…</option>
                    {availableMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.instructor?.full_name ?? "Unknown"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Hours</p>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={pickHours}
                    onChange={(e) => {
                      setPickHours(Number(e.target.value));
                    }}
                    className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  disabled={pending || !pickMember}
                  onClick={handleAddAssignment}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  <PlusIcon className="h-4 w-4" />
                  Assign
                </button>
              </div>
            )}
            {team.length === 0 && (
              <p className="text-muted-foreground mt-2 text-xs">
                Add team members in the Team tab to assign them to tasks.
              </p>
            )}
          </section>

          {/* Action items */}
          <section>
            <h3 className="text-foreground mb-2 text-sm font-semibold">
              Action items ({actionItems.length.toString()})
            </h3>
            {actionItems.length === 0 ? (
              <p className="text-muted-foreground text-xs">No action items yet.</p>
            ) : (
              <ul className="space-y-1">
                {actionItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={item.is_complete}
                      disabled={pending}
                      onChange={() => {
                        handleToggleActionItem(item);
                      }}
                      className="mt-0.5"
                    />
                    <span
                      className={`text-foreground flex-1 text-sm ${item.is_complete ? "text-muted-foreground line-through" : ""}`}
                    >
                      {item.description}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleDeleteActionItem(item.id);
                      }}
                      aria-label="Delete action item"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-2 flex gap-2">
              <input
                value={newItem}
                onChange={(e) => {
                  setNewItem(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateActionItem();
                }}
                placeholder="Add an action item…"
                className="border-input bg-background text-foreground flex-1 rounded-md border px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={pending || !newItem.trim()}
                onClick={handleCreateActionItem}
                className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
