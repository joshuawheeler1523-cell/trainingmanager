"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { traInsertSchema, TRA_PRIORITY_VALUES } from "@arbor/shared";
import type { TraPriority } from "@arbor/shared";
import { createTra } from "./actions";
import { ReadOnlyBanner, useFormReadOnly } from "@/components/auth/read-only-context";

type Props = {
  trigger: React.ReactNode;
};

type FormValues = {
  project_name: string;
  priority: TraPriority | "";
};

const PRIORITY_LABELS: Record<TraPriority, string> = {
  nice_to_have: "Nice to have",
  important: "Important",
  regulatory: "Regulatory / compliance",
};

function fieldClass(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
    error ? "border-destructive" : "border-input"
  }`;
}

export default function TraFormDialog({ trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(traInsertSchema),
    defaultValues: {
      project_name: "",
      priority: "",
    },
  });

  const readOnly = useFormReadOnly();

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createTra({
        project_name: values.project_name,
        priority: values.priority || null,
      });
      if (result.ok) {
        toast.success("Work intake created");
        setOpen(false);
        reset();
        router.push(`/tras/${result.data.id}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            New Training Request Assessment
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-xs">
            Just a name to start. You&apos;ll fill in the rest of the intake form on the next page.
          </Dialog.Description>

          <ReadOnlyBanner />

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <label
                htmlFor="project_name"
                className="text-foreground mb-1 block text-sm font-medium"
              >
                Project name *
              </label>
              <input
                id="project_name"
                {...register("project_name")}
                className={fieldClass(!!errors.project_name)}
                placeholder="Onboarding refresh 2026"
                autoFocus
              />
              {errors.project_name && (
                <p className="text-destructive mt-1 text-xs">{errors.project_name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="priority" className="text-foreground mb-1 block text-sm font-medium">
                Priority
              </label>
              <select id="priority" {...register("priority")} className={fieldClass()}>
                <option value="">— Pick later —</option>
                {TRA_PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground mt-1 text-xs">
                Required to submit. You can leave it blank now.
              </p>
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
              {!readOnly && (
                <button
                  type="submit"
                  disabled={isSubmitting || pending}
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting || pending ? "Creating…" : "Create & continue"}
                </button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
