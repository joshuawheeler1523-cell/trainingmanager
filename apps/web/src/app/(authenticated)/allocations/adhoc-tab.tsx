"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PlusIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/20/solid";
import AdHocFormDialog from "./adhoc-form-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Label, useLabel } from "@/components/labels";
import { setAdHocTaskStatus, deleteAdHocTask } from "./task-actions";
import { ADHOC_STATUS_VALUES } from "@arbor/shared";
import type { AdHocTask, AdHocStatus, AllocationBucket, Instructor } from "@arbor/shared";

type Props = {
  tasks: AdHocTask[];
  buckets: AllocationBucket[];
  instructors: Instructor[];
};

const STATUS_BADGE: Record<AdHocStatus, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-warning-bg text-warning",
  done: "bg-success-bg text-success",
  cancelled: "bg-surface text-muted-foreground",
};

export default function AdHocTab({ tasks, buckets, instructors }: Props) {
  const [pending, startTransition] = useTransition();
  const instructorLower = useLabel("entity.instructor", { lower: true });

  // Filters
  const [statusFilter, setStatusFilter] = useState<AdHocStatus | "all">("all");
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const bucketsById = useMemo(() => new Map(buckets.map((b) => [b.id, b])), [buckets]);
  const instructorsById = useMemo(() => new Map(instructors.map((i) => [i.id, i])), [instructors]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (instructorFilter !== "all") {
        if (instructorFilter === "_unassigned" && t.instructor_id !== null) return false;
        if (instructorFilter !== "_unassigned" && t.instructor_id !== instructorFilter)
          return false;
      }
      if (bucketFilter !== "all") {
        if (bucketFilter === "_unassigned" && t.bucket_id !== null) return false;
        if (bucketFilter !== "_unassigned" && t.bucket_id !== bucketFilter) return false;
      }
      if (fromDate && (!t.due_date || t.due_date < fromDate)) return false;
      if (toDate && (!t.due_date || t.due_date > toDate)) return false;
      return true;
    });
  }, [tasks, statusFilter, instructorFilter, bucketFilter, fromDate, toDate]);

  const sorted = [...filtered].sort((a, b) => {
    // Open/in-progress first, sorted by due_date asc; done/cancelled last.
    const aActive = a.status === "open" || a.status === "in_progress";
    const bActive = b.status === "open" || b.status === "in_progress";
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (!a.due_date && !b.due_date) return a.name.localeCompare(b.name);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  function handleStatusChange(id: string, status: AdHocStatus) {
    startTransition(async () => {
      const result = await setAdHocTaskStatus(id, status);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteAdHocTask(id);
      if (result.ok) toast.success("Task deleted");
      else toast.error(result.error.message);
    });
  }

  const filterSelectCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs";
  const dateInputCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs";

  return (
    <div className="space-y-4">
      {/* Filters + add */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Status</p>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as AdHocStatus | "all");
              }}
              className={`${filterSelectCls} capitalize`}
            >
              <option value="all">All</option>
              {ADHOC_STATUS_VALUES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">
              <Label kind="entity.instructor" />
            </p>
            <select
              aria-label={`Filter by ${instructorLower}`}
              value={instructorFilter}
              onChange={(e) => {
                setInstructorFilter(e.target.value);
              }}
              className={filterSelectCls}
            >
              <option value="all">All</option>
              <option value="_unassigned">— Unassigned —</option>
              {instructors
                .filter((i) => i.deleted_at === null)
                .sort((a, b) => a.full_name.localeCompare(b.full_name))
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.full_name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Bucket</p>
            <select
              aria-label="Filter by bucket"
              value={bucketFilter}
              onChange={(e) => {
                setBucketFilter(e.target.value);
              }}
              className={filterSelectCls}
            >
              <option value="all">All</option>
              <option value="_unassigned">— Unassigned —</option>
              {buckets
                .filter((b) => !b.is_archived)
                .sort((a, b) => a.display_order - b.display_order)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Due from</p>
            <input
              type="date"
              aria-label="Filter due date from"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
              }}
              className={dateInputCls}
            />
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Due to</p>
            <input
              type="date"
              aria-label="Filter due date to"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
              }}
              className={dateInputCls}
            />
          </div>
        </div>

        <AdHocFormDialog
          mode="create"
          buckets={buckets}
          instructors={instructors}
          trigger={
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              Add ad-hoc task
            </button>
          }
          onSuccess={() => {}}
        />
      </div>

      {sorted.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {tasks.length === 0 ? "No ad-hoc tasks yet." : "No tasks match the current filters."}
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
                  Assignee
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Bucket
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                  Hours
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Due
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {sorted.map((t) => {
                const bucket = t.bucket_id ? bucketsById.get(t.bucket_id) : null;
                const inst = t.instructor_id ? instructorsById.get(t.instructor_id) : null;
                return (
                  <tr key={t.id} className="hover:bg-surface">
                    <td className="text-foreground px-4 py-3 text-sm font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-xs">
                      {inst ? (
                        <span className="text-foreground">{inst.full_name}</span>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
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
                    <td className="text-foreground px-4 py-3 text-right text-xs tabular-nums">
                      {t.hours}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs tabular-nums">
                      {t.due_date ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={t.status}
                        disabled={pending}
                        onChange={(e) => {
                          handleStatusChange(t.id, e.target.value as AdHocStatus);
                        }}
                        className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize disabled:opacity-50 ${STATUS_BADGE[t.status]}`}
                        aria-label={`Change status for ${t.name}`}
                      >
                        {ADHOC_STATUS_VALUES.map((s) => (
                          <option key={s} value={s} className="capitalize">
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <AdHocFormDialog
                          mode="edit"
                          task={t}
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
                        <ConfirmDialog
                          trigger={
                            <button
                              type="button"
                              disabled={pending}
                              className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          }
                          title="Delete ad-hoc task?"
                          description="This cannot be undone."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() => {
                            handleDelete(t.id);
                          }}
                        />
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
