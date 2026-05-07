"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { adHocTaskInsertSchema, ADHOC_STATUS_VALUES } from "@arbor/shared";
import type { AdHocTask, AdHocStatus, AllocationBucket, Instructor } from "@arbor/shared";
import { createAdHocTask, updateAdHocTask } from "./task-actions";

type CreateProps = {
  mode: "create";
  trigger: React.ReactNode;
  buckets: AllocationBucket[];
  instructors: Instructor[];
  onSuccess?: () => void;
};

type EditProps = {
  mode: "edit";
  task: AdHocTask;
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
  instructor_id: string;
  hours: number;
  due_date: string;
  status: AdHocStatus;
};

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

export default function AdHocFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = props.mode === "edit";

  const defaultValues: FormValues = isEdit
    ? {
        name: props.task.name,
        description: props.task.description ?? "",
        bucket_id: props.task.bucket_id ?? "",
        instructor_id: props.task.instructor_id ?? "",
        hours: props.task.hours,
        due_date: props.task.due_date ?? "",
        status: props.task.status,
      }
    : {
        name: "",
        description: "",
        bucket_id: "",
        instructor_id: "",
        hours: 1,
        due_date: "",
        status: "open",
      };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(adHocTaskInsertSchema),
    defaultValues,
  });

  async function onSubmit(data: FormValues) {
    const payload = {
      name: data.name,
      description: data.description || null,
      bucket_id: data.bucket_id || null,
      instructor_id: data.instructor_id || null,
      hours: data.hours,
      due_date: data.due_date || null,
      status: data.status,
    };

    const result = isEdit
      ? await updateAdHocTask(props.task.id, payload)
      : await createAdHocTask(payload);

    if (result.ok) {
      toast.success(isEdit ? "Task updated" : "Task created");
      setOpen(false);
      reset();
      props.onSuccess?.();
    } else {
      toast.error(result.error.message);
    }
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
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            {isEdit ? "Edit ad-hoc task" : "Add ad-hoc task"}
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
                placeholder="Update training matrix spreadsheet"
              />
              {errors.name && (
                <p className="text-destructive mt-1 text-xs">{errors.name.message}</p>
              )}
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
                <Label htmlFor="instructor_id">Assignee</Label>
                <select
                  id="instructor_id"
                  {...register("instructor_id")}
                  className={fieldClass(!!errors.instructor_id)}
                >
                  <option value="">— Unassigned —</option>
                  {props.instructors
                    .filter((i) => i.deleted_at === null)
                    .sort((a, b) => a.full_name.localeCompare(b.full_name))
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="hours">Hours *</Label>
                <input
                  id="hours"
                  type="number"
                  step="0.25"
                  min={0}
                  {...register("hours")}
                  className={fieldClass(!!errors.hours)}
                />
                {errors.hours && (
                  <p className="text-destructive mt-1 text-xs">{errors.hours.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="due_date">Due date</Label>
                <input
                  id="due_date"
                  type="date"
                  {...register("due_date")}
                  className={fieldClass(!!errors.due_date)}
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select id="status" {...register("status")} className={fieldClass(!!errors.status)}>
                  {ADHOC_STATUS_VALUES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
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
                disabled={isSubmitting}
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
