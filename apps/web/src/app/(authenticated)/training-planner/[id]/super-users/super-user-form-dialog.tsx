"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { implSuperUserInsertSchema, implSuperUserUpdateSchema } from "@arbor/shared";
import type { ImplSuperUser } from "@arbor/shared";
import { createImplSuperUser, updateImplSuperUser } from "./actions";

type ClassOption = { id: string; name: string };

type CreateProps = {
  mode: "create";
  implementationId: string;
  classes: ClassOption[];
  trigger: React.ReactNode;
  defaultClassId?: string;
  onSuccess?: (su: ImplSuperUser) => void;
};

type EditProps = {
  mode: "edit";
  classes: ClassOption[];
  trigger: React.ReactNode;
  superUser: ImplSuperUser;
  onSuccess?: (su: ImplSuperUser) => void;
};

type Props = CreateProps | EditProps;

function fieldClass(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
    error ? "border-destructive" : "border-input"
  }`;
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
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
  unit: string;
  impl_class_id: string;
  topic: string;
  trained: boolean;
  trained_at: string;
};

export default function ImplSuperUserFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = props.mode === "edit";

  const defaultValues: FormValues = isEdit
    ? {
        full_name: props.superUser.full_name,
        email: props.superUser.email ?? "",
        phone: props.superUser.phone ?? "",
        unit: props.superUser.unit ?? "",
        impl_class_id: props.superUser.impl_class_id ?? "",
        topic: props.superUser.topic ?? "",
        trained: props.superUser.trained_at != null,
        trained_at: props.superUser.trained_at ?? "",
      }
    : {
        full_name: "",
        email: "",
        phone: "",
        unit: "",
        impl_class_id: props.defaultClassId ?? "",
        topic: "",
        trained: false,
        trained_at: "",
      };

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? implSuperUserUpdateSchema : implSuperUserInsertSchema),
    defaultValues,
  });

  const trainedChecked = watch("trained");

  async function onSubmit(values: FormValues) {
    const payload = {
      full_name: values.full_name,
      email: values.email || null,
      phone: values.phone || null,
      unit: values.unit || null,
      impl_class_id: values.impl_class_id || null,
      topic: values.topic || null,
      trained_at: values.trained
        ? values.trained_at || new Date().toISOString().slice(0, 10)
        : null,
    };

    const result = isEdit
      ? await updateImplSuperUser(props.superUser.id, payload)
      : await createImplSuperUser(props.implementationId, payload);

    if (result.ok) {
      toast.success(isEdit ? "Super user updated" : "Super user added");
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
        if (!v) reset(defaultValues);
      }}
    >
      <Dialog.Trigger asChild>{props.trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            {isEdit ? "Edit super user" : "Add super user"}
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-xs">
            Track a super user for this training plan. Separate from the org-wide list.
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <FieldLabel htmlFor="full_name">Full name *</FieldLabel>
              <input
                id="full_name"
                {...register("full_name")}
                className={fieldClass(!!errors.full_name)}
                placeholder="Jane Smith"
              />
              <FieldError message={errors.full_name?.message} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <input
                  id="email"
                  type="email"
                  {...register("email")}
                  className={fieldClass(!!errors.email)}
                />
                <FieldError message={errors.email?.message} />
              </div>
              <div>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <input id="phone" {...register("phone")} className={fieldClass(!!errors.phone)} />
                <FieldError message={errors.phone?.message} />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="unit">Unit / location</FieldLabel>
              <input
                id="unit"
                {...register("unit")}
                className={fieldClass(!!errors.unit)}
                placeholder="3 South, ICU, OR-2…"
              />
              <FieldError message={errors.unit?.message} />
            </div>

            <div className="border-border bg-surface rounded-md border p-3">
              <p className="text-foreground text-xs font-medium uppercase tracking-wide">
                Super user of
              </p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Pick a class from this training plan OR enter a free-text topic.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="impl_class_id">Class</FieldLabel>
                  <select
                    id="impl_class_id"
                    {...register("impl_class_id")}
                    className={fieldClass(!!errors.impl_class_id)}
                  >
                    <option value="">— No class —</option>
                    {props.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <FieldError message={errors.impl_class_id?.message} />
                </div>
                <div>
                  <FieldLabel htmlFor="topic">Topic</FieldLabel>
                  <input
                    id="topic"
                    {...register("topic")}
                    className={fieldClass(!!errors.topic)}
                    placeholder="Glucometer, IV pumps…"
                  />
                  <FieldError message={errors.topic?.message} />
                </div>
              </div>
            </div>

            <div className="border-border rounded-md border p-3">
              <label className="text-foreground flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" {...register("trained")} className="h-4 w-4 rounded" />
                Has been trained
              </label>
              {trainedChecked && (
                <div className="mt-3">
                  <FieldLabel htmlFor="trained_at">Trained on (optional)</FieldLabel>
                  <input
                    id="trained_at"
                    type="date"
                    {...register("trained_at")}
                    className={fieldClass(!!errors.trained_at)}
                  />
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    Leave blank to use today&apos;s date.
                  </p>
                </div>
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
                disabled={isSubmitting}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add super user"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
