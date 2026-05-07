"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { instructorInsertSchema, instructorUpdateSchema } from "@arbor/shared";
import type { Instructor } from "@arbor/shared";
import { createInstructor, updateInstructor } from "./actions";

type CreateProps = {
  mode: "create";
  trigger: React.ReactNode;
  onSuccess?: (instructor: Instructor) => void;
};

type EditProps = {
  mode: "edit";
  instructor: Instructor;
  trigger: React.ReactNode;
  onSuccess?: (instructor: Instructor) => void;
};

type Props = CreateProps | EditProps;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "on_leave", label: "On leave" },
] as const;

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

type FormValues = {
  full_name: string;
  email: string;
  phone: string;
  department: string;
  location: string;
  job_title: string;
  start_date: string;
  annual_hours: number;
  status: "active" | "inactive" | "on_leave";
  notes: string;
};

export default function InstructorFormDialog(props: Props) {
  const [open, setOpen] = useState(false);

  const isEdit = props.mode === "edit";
  const defaultValues = isEdit
    ? {
        full_name: props.instructor.full_name,
        email: props.instructor.email ?? "",
        phone: props.instructor.phone ?? "",
        department: props.instructor.department ?? "",
        location: props.instructor.location ?? "",
        job_title: props.instructor.job_title ?? "",
        start_date: props.instructor.start_date ?? "",
        annual_hours: props.instructor.annual_hours,
        status: (["inactive", "on_leave"] as string[]).includes(props.instructor.status)
          ? props.instructor.status
          : ("active" as const),
        notes: props.instructor.notes ?? "",
      }
    : {
        full_name: "",
        email: "",
        phone: "",
        department: "",
        location: "",
        job_title: "",
        start_date: "",
        annual_hours: 1880,
        status: "active" as const,
        notes: "",
      };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? instructorUpdateSchema : instructorInsertSchema),
    defaultValues,
  });

  async function onSubmit(data: FormValues) {
    const result = isEdit
      ? await updateInstructor(props.instructor.id, data)
      : await createInstructor(data);

    if (result.ok) {
      toast.success(isEdit ? "Instructor updated" : "Instructor added");
      setOpen(false);
      reset();
      props.onSuccess?.(result.data);
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
            {isEdit ? "Edit instructor" : "Add instructor"}
          </Dialog.Title>

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-4"
          >
            {/* Full name */}
            <div>
              <Label htmlFor="full_name">Full name *</Label>
              <input
                id="full_name"
                {...register("full_name")}
                className={fieldClass(!!errors.full_name)}
                placeholder="Jane Smith"
              />
              <FieldError message={errors.full_name?.message} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Email */}
              <div>
                <Label htmlFor="email">Email</Label>
                <input
                  id="email"
                  type="email"
                  {...register("email")}
                  className={fieldClass(!!errors.email)}
                  placeholder="jane@example.com"
                />
                <FieldError message={errors.email?.message} />
              </div>

              {/* Phone */}
              <div>
                <Label htmlFor="phone">Phone</Label>
                <input
                  id="phone"
                  {...register("phone")}
                  className={fieldClass(!!errors.phone)}
                  placeholder="+1 555 000 0000"
                />
                <FieldError message={errors.phone?.message} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Department */}
              <div>
                <Label htmlFor="department">Department</Label>
                <input
                  id="department"
                  {...register("department")}
                  className={fieldClass(!!errors.department)}
                  placeholder="Cardiology"
                />
                <FieldError message={errors.department?.message} />
              </div>

              {/* Location */}
              <div>
                <Label htmlFor="location">Location</Label>
                <input
                  id="location"
                  {...register("location")}
                  className={fieldClass(!!errors.location)}
                  placeholder="Main Campus"
                />
                <FieldError message={errors.location?.message} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Job title */}
              <div>
                <Label htmlFor="job_title">Job title</Label>
                <input
                  id="job_title"
                  {...register("job_title")}
                  className={fieldClass(!!errors.job_title)}
                  placeholder="Senior Trainer"
                />
                <FieldError message={errors.job_title?.message} />
              </div>

              {/* Start date */}
              <div>
                <Label htmlFor="start_date">Start date</Label>
                <input
                  id="start_date"
                  type="date"
                  {...register("start_date")}
                  className={fieldClass(!!errors.start_date)}
                />
                <FieldError message={errors.start_date?.message} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Annual hours */}
              <div>
                <Label htmlFor="annual_hours">Annual hours</Label>
                <input
                  id="annual_hours"
                  type="number"
                  min={0}
                  max={4000}
                  {...register("annual_hours")}
                  className={fieldClass(!!errors.annual_hours)}
                />
                <FieldError message={errors.annual_hours?.message} />
              </div>

              {/* Status */}
              <div>
                <Label htmlFor="status">Status</Label>
                <select id="status" {...register("status")} className={fieldClass(!!errors.status)}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.status?.message} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={3}
                {...register("notes")}
                className={fieldClass(!!errors.notes)}
                placeholder="Optional notes…"
              />
              <FieldError message={errors.notes?.message} />
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
                {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add instructor"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
