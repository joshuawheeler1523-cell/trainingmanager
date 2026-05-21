"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { bucketInsertSchema, bucketUpdateSchema, BUCKET_COLORS } from "@arbor/shared";
import type { AllocationBucket } from "@arbor/shared";
import { createBucket, updateBucket } from "./actions";
import { ReadOnlyBanner, useFormReadOnly } from "@/components/auth/read-only-context";

type CreateProps = {
  mode: "create";
  trigger: React.ReactNode;
  onSuccess?: (bucket: AllocationBucket) => void;
};

type EditProps = {
  mode: "edit";
  bucket: AllocationBucket;
  trigger: React.ReactNode;
  onSuccess?: (bucket: AllocationBucket) => void;
};

type Props = CreateProps | EditProps;

type FormValues = {
  name: string;
  description: string;
  color: string;
  display_order: number;
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

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-destructive mt-1 text-xs">{message}</p>;
}

export default function BucketFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = props.mode === "edit";

  const defaultValues: FormValues = isEdit
    ? {
        name: props.bucket.name,
        description: props.bucket.description ?? "",
        color: props.bucket.color,
        display_order: props.bucket.display_order,
      }
    : {
        name: "",
        description: "",
        color: BUCKET_COLORS[0],
        display_order: 0,
      };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? bucketUpdateSchema : bucketInsertSchema),
    defaultValues,
  });

  const color = watch("color");
  const readOnly = useFormReadOnly();

  async function onSubmit(data: FormValues) {
    const result = isEdit ? await updateBucket(props.bucket.id, data) : await createBucket(data);

    if (result.ok) {
      toast.success(isEdit ? "Bucket updated" : "Bucket created");
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
            {isEdit ? "Edit bucket" : "Add bucket"}
          </Dialog.Title>

          <ReadOnlyBanner />

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
                placeholder="Instruction"
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
                placeholder="Time spent delivering classes"
              />
            </div>

            <div>
              <Label htmlFor="color">Color</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="color">
                {BUCKET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    onClick={() => {
                      setValue("color", c, { shouldValidate: true, shouldDirty: true });
                    }}
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${
                      color === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <FieldError message={errors.color?.message} />
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
                  disabled={isSubmitting}
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create bucket"}
                </button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
