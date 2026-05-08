"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { traInsertSchema, TRA_URGENCY_VALUES } from "@arbor/shared";
import type { TraUrgency } from "@arbor/shared";
import { createTra } from "./actions";

type Props = {
  trigger: React.ReactNode;
};

type FormValues = {
  project_name: string;
  urgency: TraUrgency;
  requesting_department: string;
  stakeholder_name: string;
  stakeholder_email: string;
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
      urgency: "standard",
      requesting_department: "",
      stakeholder_name: "",
      stakeholder_email: "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createTra(values);
      if (result.ok) {
        toast.success("TRA created");
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
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            New Training Request Assessment
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-xs">
            Capture the basics now. You&apos;ll add deliverables and review on the next steps.
          </Dialog.Description>

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
              />
              {errors.project_name && (
                <p className="text-destructive mt-1 text-xs">{errors.project_name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="urgency" className="text-foreground mb-1 block text-sm font-medium">
                  Urgency
                </label>
                <select id="urgency" {...register("urgency")} className={fieldClass()}>
                  {TRA_URGENCY_VALUES.map((u) => (
                    <option key={u} value={u} className="capitalize">
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="requesting_department"
                  className="text-foreground mb-1 block text-sm font-medium"
                >
                  Department
                </label>
                <input
                  id="requesting_department"
                  {...register("requesting_department")}
                  className={fieldClass()}
                  placeholder="Cardiology"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="stakeholder_name"
                  className="text-foreground mb-1 block text-sm font-medium"
                >
                  Stakeholder
                </label>
                <input
                  id="stakeholder_name"
                  {...register("stakeholder_name")}
                  className={fieldClass()}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label
                  htmlFor="stakeholder_email"
                  className="text-foreground mb-1 block text-sm font-medium"
                >
                  Stakeholder email
                </label>
                <input
                  id="stakeholder_email"
                  type="email"
                  {...register("stakeholder_email")}
                  className={fieldClass(!!errors.stakeholder_email)}
                  placeholder="jane@example.com"
                />
                {errors.stakeholder_email && (
                  <p className="text-destructive mt-1 text-xs">
                    {errors.stakeholder_email.message}
                  </p>
                )}
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
                disabled={isSubmitting || pending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting || pending ? "Creating…" : "Create & continue"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
