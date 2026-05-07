"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  recurringTaskInsertSchema,
  FREQUENCY_VALUES,
  FREQUENCY_TO_ANNUAL,
  recurringAnnualHours,
  recurringAssignmentSlateSchema,
} from "@arbor/shared";
import type {
  AllocationBucket,
  Frequency,
  Instructor,
  RecurringTask,
  RecurringTaskInput,
  RecurringTaskAssignment,
} from "@arbor/shared";
import { createRecurringTask, updateRecurringTask, saveRecurringAssignments } from "./task-actions";

type CreateProps = {
  mode: "create";
  trigger: React.ReactNode;
  buckets: AllocationBucket[];
  instructors: Instructor[];
  onSuccess?: () => void;
};

type EditProps = {
  mode: "edit";
  task: RecurringTask;
  assignments: RecurringTaskAssignment[];
  trigger: React.ReactNode;
  buckets: AllocationBucket[];
  instructors: Instructor[];
  onSuccess?: () => void;
};

type Props = CreateProps | EditProps;

type FormValues = {
  name: string;
  description: string;
  bucket_id: string;
  hours_per_occurrence: number;
  frequency: Frequency;
  occurrences_per_year: number | null;
  status: "active" | "paused" | "archived";
};

type AssignmentDraft = { instructor_id: string; share_percent: number };

function fieldClass(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
    error ? "border-destructive" : "border-input"
  }`;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-foreground mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-destructive mt-1 text-xs">{message}</p>;
}

export default function RecurringFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = props.mode === "edit";

  const defaultValues: FormValues = isEdit
    ? {
        name: props.task.name,
        description: props.task.description ?? "",
        bucket_id: props.task.bucket_id ?? "",
        hours_per_occurrence: props.task.hours_per_occurrence,
        frequency: props.task.frequency,
        occurrences_per_year: props.task.occurrences_per_year,
        status: props.task.status,
      }
    : {
        name: "",
        description: "",
        bucket_id: "",
        hours_per_occurrence: 1,
        frequency: "weekly",
        occurrences_per_year: null,
        status: "active",
      };

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(recurringTaskInsertSchema),
    defaultValues,
  });

  const frequency = useWatch({ control, name: "frequency" });
  const occurrencesValue = useWatch({ control, name: "occurrences_per_year" });
  const hoursValue = useWatch({ control, name: "hours_per_occurrence" });
  const defaultOccurrences = FREQUENCY_TO_ANNUAL[frequency];
  const usingDefault = occurrencesValue == null;

  // Auto-fill occurrences when frequency changes IF the user is using the default.
  useEffect(() => {
    if (usingDefault) {
      setValue("occurrences_per_year", null, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency]);

  const annual = useMemo(
    () =>
      recurringAnnualHours({
        frequency,
        occurrences_per_year: usingDefault ? null : occurrencesValue,
        hours_per_occurrence: hoursValue || 0,
      }),
    [frequency, occurrencesValue, hoursValue, usingDefault],
  );

  // Local assignment slate (not part of zodResolver — we save it after the task)
  const initialAssignments: AssignmentDraft[] = isEdit
    ? props.assignments.map((a) => ({
        instructor_id: a.instructor_id,
        share_percent: a.share_percent,
      }))
    : [];
  const [assignments, setAssignments] = useState<AssignmentDraft[]>(initialAssignments);
  const [pickInstructor, setPickInstructor] = useState("");

  useEffect(() => {
    if (open) setAssignments(initialAssignments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const assignedIds = new Set(assignments.map((a) => a.instructor_id));
  const availableInstructors = props.instructors
    .filter((i) => !assignedIds.has(i.id) && i.deleted_at === null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  function distributeEvenly(rows: AssignmentDraft[]): AssignmentDraft[] {
    if (rows.length === 0) return rows;
    const each = Math.floor((100 / rows.length) * 100) / 100;
    const remainder = Math.round((100 - each * rows.length) * 100) / 100;
    return rows.map((r, i) => ({
      ...r,
      share_percent: i === 0 ? each + remainder : each,
    }));
  }

  function addAssignment() {
    if (!pickInstructor) return;
    const next = [...assignments, { instructor_id: pickInstructor, share_percent: 0 }];
    setAssignments(distributeEvenly(next));
    setPickInstructor("");
  }

  function updateShare(idx: number, share: number) {
    setAssignments((prev) => prev.map((a, i) => (i === idx ? { ...a, share_percent: share } : a)));
  }

  function removeAssignment(idx: number) {
    setAssignments((prev) => distributeEvenly(prev.filter((_, i) => i !== idx)));
  }

  function instructorName(id: string) {
    return props.instructors.find((i) => i.id === id)?.full_name ?? id;
  }

  const shareSum = Math.round(assignments.reduce((acc, a) => acc + a.share_percent, 0) * 100) / 100;
  const shareValid = assignments.length === 0 || Math.abs(shareSum - 100) < 0.005;

  async function onSubmit(data: FormValues) {
    if (assignments.length > 0) {
      const validate = recurringAssignmentSlateSchema.safeParse(assignments);
      if (!validate.success) {
        toast.error(validate.error.errors[0]?.message ?? "Invalid assignment shares.");
        return;
      }
    }

    const payload: RecurringTaskInput = {
      name: data.name,
      description: data.description || null,
      bucket_id: data.bucket_id || null,
      hours_per_occurrence: data.hours_per_occurrence,
      frequency: data.frequency,
      occurrences_per_year: usingDefault ? null : occurrencesValue,
      status: data.status,
    };

    const taskResult = isEdit
      ? await updateRecurringTask(props.task.id, payload)
      : await createRecurringTask(payload);

    if (!taskResult.ok) {
      toast.error(taskResult.error.message);
      return;
    }

    const assignResult = await saveRecurringAssignments(taskResult.data.id, assignments);
    if (!assignResult.ok) {
      toast.error(assignResult.error.message);
      return;
    }

    toast.success(isEdit ? "Recurring task updated" : "Recurring task created");
    setOpen(false);
    reset();
    setAssignments([]);
    props.onSuccess?.();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Dialog.Trigger asChild>{props.trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            {isEdit ? "Edit recurring task" : "Add recurring task"}
          </Dialog.Title>

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <Label htmlFor="name">Name *</Label>
              <input
                id="name"
                {...register("name")}
                className={fieldClass(!!errors.name)}
                placeholder="Weekly safety huddle"
              />
              <FieldError message={errors.name?.message} />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={2}
                {...register("description")}
                className={fieldClass(!!errors.description)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="bucket_id">Bucket</Label>
                <select
                  id="bucket_id"
                  {...register("bucket_id")}
                  className={fieldClass(!!errors.bucket_id)}
                >
                  <option value="">— Unassigned —</option>
                  {props.buckets
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
                <Label htmlFor="status">Status</Label>
                <select id="status" {...register("status")} className={fieldClass(!!errors.status)}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="hours_per_occurrence">Hours / occurrence *</Label>
                <input
                  id="hours_per_occurrence"
                  type="number"
                  step="0.25"
                  min={0}
                  {...register("hours_per_occurrence")}
                  className={fieldClass(!!errors.hours_per_occurrence)}
                />
                <FieldError message={errors.hours_per_occurrence?.message} />
              </div>
              <div>
                <Label htmlFor="frequency">Frequency *</Label>
                <select
                  id="frequency"
                  {...register("frequency")}
                  className={fieldClass(!!errors.frequency)}
                >
                  {FREQUENCY_VALUES.map((f) => (
                    <option key={f} value={f} className="capitalize">
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="occurrences_per_year">Occurrences / year</Label>
                <input
                  id="occurrences_per_year"
                  type="number"
                  min={0}
                  placeholder={`Default: ${String(defaultOccurrences)}`}
                  value={occurrencesValue ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setValue("occurrences_per_year", v === "" ? null : Number(v), {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  className={fieldClass(!!errors.occurrences_per_year)}
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  {usingDefault
                    ? `Using default (${String(defaultOccurrences)}/yr)`
                    : `Override (default ${String(defaultOccurrences)}/yr)`}
                </p>
              </div>
            </div>

            <div className="border-border bg-surface flex items-center justify-between rounded-lg border p-3">
              <span className="text-muted-foreground text-xs font-medium">Annual hours</span>
              <span className="text-foreground text-base font-semibold tabular-nums">
                {annual.toFixed(1)} h
              </span>
            </div>

            {/* Instructor assignments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-foreground text-sm font-semibold">
                  Instructor assignments ({assignments.length})
                </h4>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                    shareValid
                      ? "bg-surface text-muted-foreground"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {assignments.length === 0 ? "Unassigned" : `${shareSum.toFixed(1)}% total`}
                </span>
              </div>

              {assignments.length > 0 && (
                <div className="border-border overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="border-border bg-surface border-b">
                      <tr>
                        <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                          Instructor
                        </th>
                        <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                          Share %
                        </th>
                        <th className="w-8 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                      {assignments.map((a, i) => (
                        <tr key={a.instructor_id}>
                          <td className="text-foreground px-3 py-2 text-xs">
                            {instructorName(a.instructor_id)}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.5"
                              value={a.share_percent}
                              onChange={(e) => {
                                updateShare(i, Number(e.target.value));
                              }}
                              className="border-input bg-background text-foreground w-20 rounded border px-2 py-1 text-right text-xs tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                removeAssignment(i);
                              }}
                              aria-label="Remove assignment"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {availableInstructors.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={pickInstructor}
                    onChange={(e) => {
                      setPickInstructor(e.target.value);
                    }}
                    className="border-input bg-background text-foreground flex-1 rounded-md border px-2 py-1.5 text-sm"
                  >
                    <option value="">Add instructor…</option>
                    {availableInstructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addAssignment}
                    disabled={!pickInstructor}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add
                  </button>
                </div>
              )}

              {!shareValid && (
                <p className="text-destructive text-xs">
                  Share percentages must sum to 100% before saving.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting || !shareValid}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create task"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
