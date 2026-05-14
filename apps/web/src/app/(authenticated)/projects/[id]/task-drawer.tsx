"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  type Instructor,
  type Milestone,
  type Project,
  type ProjectTeamMember,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskDependency,
  type TaskStatus,
} from "@arbor/shared";
import {
  assignTaskMember,
  createActionItem,
  createDependency,
  deleteActionItem,
  deleteDependency,
  deleteTask,
  unassignTaskMember,
  updateActionItem,
  updateTask,
} from "../actions";

export type TeamMemberWithInstructor = ProjectTeamMember & { instructor: Instructor | null };

type Props = {
  project: Project;
  task: Task;
  allProjectTasks: Task[];
  team: TeamMemberWithInstructor[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
  dependencies: TaskDependency[];
  milestones: Milestone[];
  onClose: () => void;
};

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function TaskDrawer({
  project,
  task,
  allProjectTasks,
  team,
  assignments,
  actionItems,
  dependencies,
  milestones,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Optimistic mirror of the task so controlled <select>s (status,
  // priority, milestone) reflect changes instantly instead of waiting
  // for a router.refresh. useOptimistic auto-reverts on transition
  // failure, so a server-side reject snaps the chip back.
  const [optimisticTask, applyTaskPatch] = useOptimistic(task, (state, patch: Partial<Task>) => ({
    ...state,
    ...patch,
  }));
  // Same pattern for the action-items list — checkbox toggles need to
  // flip without a 400-800ms refresh round-trip.
  const [optimisticActionItems, applyActionItemPatch] = useOptimistic(
    actionItems,
    (state, action: { kind: "update"; item: TaskActionItem }) => {
      const idx = state.findIndex((i) => i.id === action.item.id);
      if (idx < 0) return state;
      const next = state.slice();
      next[idx] = action.item;
      return next;
    },
  );

  // Local mirror of editable text fields so blur-save feels snappy without flickering
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? "");
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [endDate, setEndDate] = useState(task.end_date ?? "");
  const [estimatedHours, setEstimatedHours] = useState(
    task.estimated_hours != null ? String(task.estimated_hours) : "",
  );

  // Reset local state when a different task opens
  useEffect(() => {
    setName(task.name);
    setDescription(task.description ?? "");
    setStartDate(task.start_date ?? "");
    setEndDate(task.end_date ?? "");
    setEstimatedHours(task.estimated_hours != null ? String(task.estimated_hours) : "");
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(p: Record<string, unknown>) {
    startTransition(async () => {
      // Optimistic: render the patched task immediately so chips and
      // % complete don't snap back. Skip router.refresh on success —
      // saves ~400-800ms of server-component re-fetch per field edit.
      applyTaskPatch(p);
      const result = await updateTask(task.id, project.id, p);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function patchOnBlur(field: string, raw: string, current: string | number | null) {
    const next: string | number | null =
      raw === "" ? null : field === "estimated_hours" ? Number(raw) : raw;
    if (next === current || (next === null && current === null)) return;
    patch({ [field]: next });
  }

  // Assignments
  const assignedIds = new Set(assignments.map((a) => a.project_team_member_id));
  const availableMembers = team.filter((m) => !assignedIds.has(m.id));
  const [pickMember, setPickMember] = useState("");
  const [pickHours, setPickHours] = useState(0);

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
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  // Predecessors (task_dependencies where this task is the successor)
  const predecessors = dependencies.filter((d) => d.successor_id === task.id);
  const predecessorIds = new Set(predecessors.map((d) => d.predecessor_id));
  const candidatePredecessors = allProjectTasks.filter(
    (t) => t.id !== task.id && !predecessorIds.has(t.id),
  );
  const [pickPredecessor, setPickPredecessor] = useState("");
  const taskNameById = new Map(allProjectTasks.map((t) => [t.id, t.name]));

  function handleAddPredecessor() {
    if (!pickPredecessor) return;
    startTransition(async () => {
      const result = await createDependency(project.id, {
        predecessor_id: pickPredecessor,
        successor_id: task.id,
      });
      if (result.ok) {
        setPickPredecessor("");
        router.refresh();
      } else if (result.error.message.toLowerCase().includes("cycle")) {
        toast.error("That predecessor would create a cycle.");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemovePredecessor(depId: string) {
    startTransition(async () => {
      const result = await deleteDependency(depId, project.id);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  // Action items
  const [newItem, setNewItem] = useState("");

  function handleCreateActionItem() {
    const desc = newItem.trim();
    if (!desc) return;
    startTransition(async () => {
      const result = await createActionItem(task.id, project.id, { description: desc });
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
      applyActionItemPatch({
        kind: "update",
        item: { ...item, is_complete: !item.is_complete },
      });
      const result = await updateActionItem(item.id, project.id, {
        is_complete: !item.is_complete,
      });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function handleDeleteActionItem(id: string) {
    startTransition(async () => {
      const result = await deleteActionItem(id, project.id);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleDeleteTask() {
    startTransition(async () => {
      const result = await deleteTask(task.id, project.id);
      if (result.ok) {
        toast.success("Task deleted");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background flex w-full max-w-xl flex-col border-l shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-border flex items-start justify-between border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              onBlur={() => {
                if (name.trim() && name !== task.name) patch({ name });
              }}
              className="text-foreground w-full bg-transparent text-base font-semibold focus:outline-none"
            />
            <p className="text-muted-foreground mt-0.5 text-xs">
              <span className="capitalize">{optimisticTask.status.replace(/_/g, " ")}</span> ·{" "}
              {optimisticTask.percent_complete.toString()}%
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={handleDeleteTask}
              aria-label="Delete task"
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {/* Status / priority / progress */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Status</p>
              <select
                value={optimisticTask.status}
                disabled={pending}
                onChange={(e) => {
                  const s = e.target.value as TaskStatus;
                  const p: Record<string, unknown> = { status: s };
                  if (s === "completed") p["percent_complete"] = 100;
                  patch(p);
                }}
                className={`${fieldClass} capitalize`}
              >
                {TASK_STATUS_VALUES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Priority</p>
              <select
                value={optimisticTask.priority}
                disabled={pending}
                onChange={(e) => {
                  patch({ priority: e.target.value });
                }}
                className={`${fieldClass} capitalize`}
              >
                {TASK_PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">% complete</p>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                defaultValue={task.percent_complete}
                disabled={pending}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== task.percent_complete) patch({ percent_complete: v });
                }}
                className={`${fieldClass} tabular-nums`}
              />
            </div>
          </div>

          {/* Dates + hours + milestone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Start</p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                }}
                onBlur={() => {
                  patchOnBlur("start_date", startDate, task.start_date);
                }}
                className={fieldClass}
              />
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">End</p>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                }}
                onBlur={() => {
                  patchOnBlur("end_date", endDate, task.end_date);
                }}
                className={fieldClass}
              />
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                Estimated hours
              </p>
              <input
                type="number"
                min={0}
                step="0.5"
                value={estimatedHours}
                onChange={(e) => {
                  setEstimatedHours(e.target.value);
                }}
                onBlur={() => {
                  patchOnBlur("estimated_hours", estimatedHours, task.estimated_hours);
                }}
                className={`${fieldClass} tabular-nums`}
              />
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Milestone</p>
              <select
                value={optimisticTask.milestone_id ?? ""}
                disabled={pending}
                onChange={(e) => {
                  patch({ milestone_id: e.target.value || null });
                }}
                className={fieldClass}
              >
                <option value="">— None —</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Description</p>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              onBlur={() => {
                patchOnBlur("description", description, task.description);
              }}
              className={`${fieldClass} resize-y`}
            />
          </div>

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
                    className={fieldClass}
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
                    className={`${fieldClass} tabular-nums`}
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
          </section>

          {/* Predecessors */}
          <section>
            <h3 className="text-foreground mb-2 text-sm font-semibold">
              Predecessors ({predecessors.length.toString()})
            </h3>
            {predecessors.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No predecessors. This task can start at any time.
              </p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-md border">
                {predecessors.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-foreground">
                      {taskNameById.get(d.predecessor_id) ?? "Unknown"}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleRemovePredecessor(d.id);
                      }}
                      aria-label="Remove predecessor"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {candidatePredecessors.length > 0 && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Add predecessor</p>
                  <select
                    value={pickPredecessor}
                    onChange={(e) => {
                      setPickPredecessor(e.target.value);
                    }}
                    className={fieldClass}
                  >
                    <option value="">Select task…</option>
                    {candidatePredecessors.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={pending || !pickPredecessor}
                  onClick={handleAddPredecessor}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add
                </button>
              </div>
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
                {optimisticActionItems.map((item) => (
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
                className={fieldClass}
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
