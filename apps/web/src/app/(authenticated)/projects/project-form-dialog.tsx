"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  projectInsertSchema,
  PROJECT_PRIORITY_VALUES,
  PROJECT_STATUS_VALUES,
  type ProjectPriority,
  type ProjectStatus,
} from "@arbor/shared";
import { createProject, updateProject } from "./actions";

type FormValues = {
  name: string;
  description: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  total_estimated_hours: string;
};

type Props = {
  mode: "create" | "edit";
  initial?: Partial<FormValues> & { id?: string };
  onClose: () => void;
};

function fieldClass(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
    error ? "border-destructive" : "border-input"
  }`;
}

export default function ProjectFormDialog({ mode, initial, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(projectInsertSchema),
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      priority: initial?.priority ?? "medium",
      status: initial?.status ?? "planning",
      start_date: initial?.start_date ?? "",
      end_date: initial?.end_date ?? "",
      total_estimated_hours: initial?.total_estimated_hours ?? "",
    },
  });

  function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      description: values.description || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      total_estimated_hours: values.total_estimated_hours
        ? Number(values.total_estimated_hours)
        : null,
    };
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProject(payload)
          : await updateProject(initial?.id ?? "", payload);
      if (result.ok) {
        toast.success(mode === "create" ? "Project created" : "Project updated");
        onClose();
        if (mode === "create") {
          router.push(`/projects/${result.data.id}`);
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            {mode === "create" ? "New project" : "Edit project"}
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-xs">
            Capture the high-level project shape. Tasks and team members come next.
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-3"
          >
            <div>
              <label htmlFor="name" className="text-foreground mb-1 block text-xs font-medium">
                Name *
              </label>
              <input id="name" {...register("name")} className={fieldClass(!!errors.name)} />
              {errors.name && (
                <p className="text-destructive mt-1 text-xs">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="description"
                className="text-foreground mb-1 block text-xs font-medium"
              >
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                {...register("description")}
                className={fieldClass()}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="status" className="text-foreground mb-1 block text-xs font-medium">
                  Status
                </label>
                <select id="status" {...register("status")} className={fieldClass()}>
                  {PROJECT_STATUS_VALUES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="priority"
                  className="text-foreground mb-1 block text-xs font-medium"
                >
                  Priority
                </label>
                <select id="priority" {...register("priority")} className={fieldClass()}>
                  {PROJECT_PRIORITY_VALUES.map((p) => (
                    <option key={p} value={p} className="capitalize">
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="start_date"
                  className="text-foreground mb-1 block text-xs font-medium"
                >
                  Start date
                </label>
                <input
                  id="start_date"
                  type="date"
                  {...register("start_date")}
                  className={fieldClass()}
                />
              </div>
              <div>
                <label
                  htmlFor="end_date"
                  className="text-foreground mb-1 block text-xs font-medium"
                >
                  End date
                </label>
                <input
                  id="end_date"
                  type="date"
                  {...register("end_date")}
                  className={fieldClass()}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="total_estimated_hours"
                className="text-foreground mb-1 block text-xs font-medium"
              >
                Estimated hours
              </label>
              <input
                id="total_estimated_hours"
                type="number"
                min={0}
                step="1"
                {...register("total_estimated_hours")}
                className={fieldClass()}
                placeholder="e.g. 200"
              />
            </div>

            <div className="border-border mt-4 flex items-center justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || isSubmitting}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {pending || isSubmitting ? "Saving…" : mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
