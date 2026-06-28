"use client";

import { useMemo, useState, useTransition } from "react";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/20/solid";
import type { OnboardingProgress, OnboardingStatus, OnboardingTask } from "@arbor/shared";
import { Button, Modal, Field, Input, Select, Textarea, Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { createTask, updateTask, deleteTask, reorderTasks, upsertProgress } from "./actions";

export type GridInstructor = { id: string; full_name: string; job_title: string | null };

type CellState = { status: OnboardingStatus; completed_at: string | null; notes: string | null };

const STATUS_META: Record<
  OnboardingStatus,
  { label: string; dot: string; badge: "neutral" | "info" | "success" }
> = {
  not_started: { label: "Not started", dot: "bg-muted-foreground/30", badge: "neutral" },
  in_progress: { label: "In progress", dot: "bg-[var(--persimmon)]", badge: "info" },
  done: { label: "Done", dot: "bg-[var(--forest)]", badge: "success" },
};

const STATUS_ORDER: OnboardingStatus[] = ["not_started", "in_progress", "done"];

function cellKey(instructorId: string, taskId: string) {
  return `${instructorId}:${taskId}`;
}

export default function OnboardingGrid({
  instructors,
  tasks: initialTasks,
  progress,
  manageColumns = true,
  emptyTrainersHint,
}: {
  instructors: GridInstructor[];
  tasks: OnboardingTask[];
  progress: OnboardingProgress[];
  manageColumns?: boolean;
  emptyTrainersHint?: string;
}) {
  const [tasks, setTasks] = useState<OnboardingTask[]>(initialTasks);
  const [cells, setCells] = useState<Map<string, CellState>>(
    () =>
      new Map(
        progress.map((p) => [
          cellKey(p.instructor_id, p.task_id),
          { status: p.status, completed_at: p.completed_at, notes: p.notes },
        ]),
      ),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── cell editor ──
  const [editingCell, setEditingCell] = useState<{
    instructor: GridInstructor;
    task: OnboardingTask;
  } | null>(null);

  // ── column editor ──
  const [taskModal, setTaskModal] = useState<
    { mode: "add" } | { mode: "edit"; task: OnboardingTask } | null
  >(null);

  const completion = useMemo(() => {
    if (instructors.length === 0 || tasks.length === 0) return null;
    let done = 0;
    for (const i of instructors) {
      for (const t of tasks) {
        if (cells.get(cellKey(i.id, t.id))?.status === "done") done++;
      }
    }
    const total = instructors.length * tasks.length;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [instructors, tasks, cells]);

  function run(
    fn: () => Promise<{ ok: boolean; error?: { message: string } }>,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error?.message ?? "Something went wrong");
        return;
      }
      after?.();
    });
  }

  function saveCell(state: CellState) {
    if (!editingCell) return;
    const { instructor, task } = editingCell;
    run(
      () =>
        upsertProgress({
          instructor_id: instructor.id,
          task_id: task.id,
          status: state.status,
          completed_at: state.completed_at,
          notes: state.notes,
        }),
      () => {
        setCells((prev) => {
          const next = new Map(prev);
          const isEmpty = state.status === "not_started" && !state.completed_at && !state.notes;
          if (isEmpty) next.delete(cellKey(instructor.id, task.id));
          else next.set(cellKey(instructor.id, task.id), state);
          return next;
        });
        setEditingCell(null);
      },
    );
  }

  function moveColumn(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= tasks.length) return;
    const a = tasks[index];
    const b = tasks[target];
    if (!a || !b) return;
    const next = [...tasks];
    next[index] = b;
    next[target] = a;
    setTasks(next);
    run(() => reorderTasks(next.map((t) => t.id)));
  }

  return (
    <div className="space-y-4">
      {completion && (
        <div className="flex items-center gap-3 text-sm">
          <div className="bg-surface h-2 w-48 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-[var(--forest)] transition-[width]"
              style={{ width: `${String(completion.pct)}%` }}
            />
          </div>
          <span className="text-muted-foreground tabular-nums">
            {completion.done}/{completion.total} tasks done · {completion.pct}%
          </span>
        </div>
      )}

      {error && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {instructors.length === 0 ? (
        <EmptyState
          title="No external trainers yet"
          description={
            emptyTrainersHint ??
            "Mark instructors as external on their profile to onboard them here."
          }
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No onboarding tasks yet"
          description="Add the checklist items every external trainer needs to complete."
          action={
            manageColumns ? (
              <Button
                variant="primary"
                onClick={() => {
                  setTaskModal({ mode: "add" });
                }}
              >
                <PlusIcon className="h-4 w-4" /> Add task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border bg-surface/50 border-b">
                <th className="bg-surface/50 sticky left-0 z-10 min-w-[180px] px-3 py-2 text-left font-medium">
                  Trainer
                </th>
                {tasks.map((task, i) => (
                  <th
                    key={task.id}
                    className="min-w-[150px] px-3 py-2 text-left align-top font-medium"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <div className="truncate">{task.name}</div>
                        {task.description && (
                          <div className="text-muted-foreground mt-0.5 truncate text-xs font-normal">
                            {task.description}
                          </div>
                        )}
                      </div>
                      {manageColumns && (
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            aria-label="Move left"
                            disabled={i === 0 || isPending}
                            onClick={() => {
                              moveColumn(i, -1);
                            }}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronLeftIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move right"
                            disabled={i === tasks.length - 1 || isPending}
                            onClick={() => {
                              moveColumn(i, 1);
                            }}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronRightIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit ${task.name}`}
                            onClick={() => {
                              setTaskModal({ mode: "edit", task });
                            }}
                            className="text-muted-foreground hover:text-foreground ml-1"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                ))}
                {manageColumns && (
                  <th className="w-10 px-2 py-2">
                    <button
                      type="button"
                      aria-label="Add task"
                      onClick={() => {
                        setTaskModal({ mode: "add" });
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {instructors.map((instr) => (
                <tr key={instr.id} className="border-border/60 border-b last:border-0">
                  <td className="bg-background sticky left-0 z-10 px-3 py-2 align-top">
                    <div className="font-medium">{instr.full_name}</div>
                    {instr.job_title && (
                      <div className="text-muted-foreground text-xs">{instr.job_title}</div>
                    )}
                  </td>
                  {tasks.map((task) => {
                    const cell = cells.get(cellKey(instr.id, task.id));
                    const status = cell?.status ?? "not_started";
                    const meta = STATUS_META[status];
                    return (
                      <td key={task.id} className="px-2 py-1.5 align-top">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCell({ instructor: instr, task });
                          }}
                          className="hover:bg-surface group flex w-full flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                            <span className="text-xs">{meta.label}</span>
                          </span>
                          {cell?.completed_at && (
                            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                              {cell.completed_at}
                            </span>
                          )}
                          {cell?.notes && (
                            <span className="text-muted-foreground line-clamp-2 text-[11px]">
                              {cell.notes}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                  {manageColumns && <td />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingCell && (
        <CellEditor
          instructor={editingCell.instructor}
          task={editingCell.task}
          initial={
            cells.get(cellKey(editingCell.instructor.id, editingCell.task.id)) ?? {
              status: "not_started",
              completed_at: null,
              notes: null,
            }
          }
          pending={isPending}
          onClose={() => {
            setEditingCell(null);
          }}
          onSave={saveCell}
        />
      )}

      {taskModal && (
        <TaskEditor
          key={taskModal.mode === "edit" ? taskModal.task.id : "add"}
          task={taskModal.mode === "edit" ? taskModal.task : null}
          pending={isPending}
          onClose={() => {
            setTaskModal(null);
          }}
          onSubmit={(values) => {
            if (taskModal.mode === "add") {
              run(
                async () => {
                  const res = await createTask(values);
                  if (res.ok) setTasks((prev) => [...prev, res.data]);
                  return res;
                },
                () => {
                  setTaskModal(null);
                },
              );
            } else {
              const id = taskModal.task.id;
              run(
                async () => {
                  const res = await updateTask(id, values);
                  if (res.ok) setTasks((prev) => prev.map((t) => (t.id === id ? res.data : t)));
                  return res;
                },
                () => {
                  setTaskModal(null);
                },
              );
            }
          }}
          onDelete={
            taskModal.mode === "edit"
              ? () => {
                  const id = taskModal.task.id;
                  run(
                    async () => {
                      const res = await deleteTask(id);
                      if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id));
                      return res;
                    },
                    () => {
                      setTaskModal(null);
                    },
                  );
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function CellEditor({
  instructor,
  task,
  initial,
  pending,
  onClose,
  onSave,
}: {
  instructor: GridInstructor;
  task: OnboardingTask;
  initial: CellState;
  pending: boolean;
  onClose: () => void;
  onSave: (state: CellState) => void;
}) {
  const [status, setStatus] = useState<OnboardingStatus>(initial.status);
  const [completedAt, setCompletedAt] = useState(initial.completed_at ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");

  return (
    <Modal
      open
      onClose={onClose}
      title={task.name}
      description={instructor.full_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => {
              onSave({
                status,
                completed_at: completedAt.trim() === "" ? null : completedAt,
                notes: notes.trim() === "" ? null : notes,
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label="Status">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OnboardingStatus);
          }}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Completed on" helper="Optional — the date this task was finished.">
        <Input
          type="date"
          value={completedAt}
          onChange={(e) => {
            setCompletedAt(e.target.value);
          }}
        />
      </Field>
      <Field label="Notes" helper="Optional — anything to remember about this item.">
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
      </Field>
    </Modal>
  );
}

function TaskEditor({
  task,
  pending,
  onClose,
  onSubmit,
  onDelete,
}: {
  task: OnboardingTask | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; description: string | null }) => void;
  onDelete?: (() => void) | undefined;
}) {
  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");

  return (
    <Modal
      open
      onClose={onClose}
      title={task ? "Edit task" : "Add onboarding task"}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {onDelete && (
              <Button variant="destructive" onClick={onDelete} disabled={pending}>
                <TrashIcon className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={pending || name.trim() === ""}
              onClick={() => {
                onSubmit({
                  name: name.trim(),
                  description: description.trim() === "" ? null : description.trim(),
                });
              }}
            >
              {task ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      }
    >
      <Field label="Task name">
        <Input
          autoFocus
          value={name}
          maxLength={200}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="e.g. Signed contract"
        />
      </Field>
      <Field label="Description" helper="Optional — shown under the column header.">
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </Field>
      {task && <Badge variant="neutral">Applies to every external trainer</Badge>}
    </Modal>
  );
}
