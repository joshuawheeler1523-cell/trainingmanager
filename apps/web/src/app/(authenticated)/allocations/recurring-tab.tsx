"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  PlusIcon,
  PencilSquareIcon,
  PauseIcon,
  PlayIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/20/solid";
import RecurringFormDialog from "./recurring-form-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { archiveRecurringTask, setRecurringTaskStatus } from "./task-actions";
import { recurringAnnualHours, effectiveOccurrencesPerYear } from "@arbor/shared";
import type {
  AllocationBucket,
  Instructor,
  RecurringTask,
  RecurringTaskAssignment,
} from "@arbor/shared";

type Props = {
  tasks: RecurringTask[];
  assignments: RecurringTaskAssignment[];
  buckets: AllocationBucket[];
  instructors: Instructor[];
};

const STATUS_BADGE: Record<RecurringTask["status"], string> = {
  active: "bg-primary/10 text-primary",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  archived: "bg-surface text-muted-foreground",
};

export default function RecurringTab({ tasks, assignments, buckets, instructors }: Props) {
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);

  const bucketsById = useMemo(() => new Map(buckets.map((b) => [b.id, b])), [buckets]);
  const instructorsById = useMemo(() => new Map(instructors.map((i) => [i.id, i])), [instructors]);

  const assignmentsByTask = useMemo(() => {
    const m = new Map<string, RecurringTaskAssignment[]>();
    for (const a of assignments) {
      const list = m.get(a.recurring_task_id) ?? [];
      list.push(a);
      m.set(a.recurring_task_id, list);
    }
    return m;
  }, [assignments]);

  const visible = tasks
    .filter((t) => (showArchived ? t.status === "archived" : t.status !== "archived"))
    .sort((a, b) => a.name.localeCompare(b.name));

  function togglePause(t: RecurringTask) {
    const next = t.status === "paused" ? "active" : "paused";
    startTransition(async () => {
      const result = await setRecurringTaskStatus(t.id, next);
      if (result.ok) toast.success(next === "paused" ? "Task paused" : "Task resumed");
      else toast.error(result.error.message);
    });
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      const result = await archiveRecurringTask(id);
      if (result.ok) toast.success("Task archived");
      else toast.error(result.error.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
            }}
            className="border-border h-3.5 w-3.5 rounded"
          />
          Show archived
        </label>
        <RecurringFormDialog
          mode="create"
          buckets={buckets}
          instructors={instructors}
          trigger={
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              Add recurring task
            </button>
          }
          onSuccess={() => {}}
        />
      </div>

      {visible.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {showArchived
              ? "No archived recurring tasks."
              : "No recurring tasks yet — add one to track standing meetings, on-call shifts, etc."}
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Name
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Bucket
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Frequency
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                  Hrs / occ
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                  Occ / yr
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                  Annual hrs
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Assigned
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {visible.map((t) => {
                const bucket = t.bucket_id ? bucketsById.get(t.bucket_id) : null;
                const taskAssignments = assignmentsByTask.get(t.id) ?? [];
                const occ = effectiveOccurrencesPerYear(t);
                const annual = recurringAnnualHours({
                  frequency: t.frequency,
                  occurrences_per_year: t.occurrences_per_year,
                  hours_per_occurrence: t.hours_per_occurrence,
                });
                const usingDefault = t.occurrences_per_year === null;
                return (
                  <tr key={t.id} className="hover:bg-surface">
                    <td className="text-foreground px-4 py-3 text-sm font-medium">{t.name}</td>
                    <td className="px-4 py-3">
                      {bucket ? (
                        <span className="text-foreground inline-flex items-center gap-2 text-xs">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: bucket.color }}
                          />
                          {bucket.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="text-foreground px-4 py-3 text-xs capitalize">{t.frequency}</td>
                    <td className="text-foreground px-4 py-3 text-right text-xs tabular-nums">
                      {t.hours_per_occurrence}
                    </td>
                    <td className="text-foreground px-4 py-3 text-right text-xs tabular-nums">
                      {occ}
                      {usingDefault && (
                        <span
                          className="text-muted-foreground ml-1"
                          title="Using per-frequency default"
                        >
                          ·
                        </span>
                      )}
                    </td>
                    <td className="text-foreground px-4 py-3 text-right text-xs font-semibold tabular-nums">
                      {annual.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      {taskAssignments.length === 0 ? (
                        <span className="text-muted-foreground text-xs">Unassigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {taskAssignments.map((a) => (
                            <span
                              key={a.instructor_id}
                              className="bg-surface text-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                            >
                              {instructorsById.get(a.instructor_id)?.full_name ?? a.instructor_id}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[t.status]}`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {t.status !== "archived" && (
                          <>
                            <RecurringFormDialog
                              mode="edit"
                              task={t}
                              assignments={taskAssignments}
                              buckets={buckets}
                              instructors={instructors}
                              trigger={
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                                >
                                  <PencilSquareIcon className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              }
                              onSuccess={() => {}}
                            />
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                togglePause(t);
                              }}
                              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs disabled:opacity-50"
                            >
                              {t.status === "paused" ? (
                                <>
                                  <PlayIcon className="h-3.5 w-3.5" />
                                  Resume
                                </>
                              ) : (
                                <>
                                  <PauseIcon className="h-3.5 w-3.5" />
                                  Pause
                                </>
                              )}
                            </button>
                            <ConfirmDialog
                              trigger={
                                <button
                                  type="button"
                                  disabled={pending}
                                  className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                                >
                                  <ArchiveBoxIcon className="h-3.5 w-3.5" />
                                  Archive
                                </button>
                              }
                              title="Archive recurring task?"
                              description="The task will be hidden and stop contributing to workload. You can restore later by clearing deleted_at via SQL."
                              confirmLabel="Archive"
                              destructive
                              onConfirm={() => {
                                handleArchive(t.id);
                              }}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
