"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { groupInsertSchema, groupUpdateSchema } from "@arbor/shared";
import type { AllocationGroup } from "@arbor/shared";
import { createGroup, updateGroup } from "./actions";

type CreateProps = {
  mode: "create";
  trigger: React.ReactNode;
  onSuccess?: (group: AllocationGroup) => void;
};

type EditProps = {
  mode: "edit";
  group: AllocationGroup;
  trigger: React.ReactNode;
  onSuccess?: (group: AllocationGroup) => void;
};

type Props = CreateProps | EditProps;

type FormValues = {
  name: string;
  description: string;
};

function fieldClass(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
    error ? "border-destructive" : "border-input"
  }`;
}

export default function GroupFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = props.mode === "edit";

  const defaultValues: FormValues = isEdit
    ? {
        name: props.group.name,
        description: props.group.description ?? "",
      }
    : { name: "", description: "" };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? groupUpdateSchema : groupInsertSchema),
    defaultValues,
  });

  async function onSubmit(data: FormValues) {
    const result = isEdit ? await updateGroup(props.group.id, data) : await createGroup(data);

    if (result.ok) {
      toast.success(isEdit ? "Group updated" : "Group created");
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
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            {isEdit ? "Edit group" : "Add group"}
          </Dialog.Title>

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <label htmlFor="name" className="text-foreground mb-1 block text-sm font-medium">
                Name *
              </label>
              <input
                id="name"
                {...register("name")}
                className={fieldClass(!!errors.name)}
                placeholder="Clinical Instructors"
              />
              {errors.name && (
                <p className="text-destructive mt-1 text-xs">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="description"
                className="text-foreground mb-1 block text-sm font-medium"
              >
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                {...register("description")}
                className={fieldClass(!!errors.description)}
                placeholder="Optional description…"
              />
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
                {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create group"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
