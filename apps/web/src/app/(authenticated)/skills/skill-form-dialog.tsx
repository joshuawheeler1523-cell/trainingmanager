"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { skillInsertSchema, skillUpdateSchema } from "@arbor/shared";
import type { Skill } from "@arbor/shared";
import { createSkill, updateSkill } from "./actions";
import { ReadOnlyBanner, useFormReadOnly } from "@/components/auth/read-only-context";

type CreateProps = {
  mode: "create";
  trigger: React.ReactNode;
  onSuccess?: (skill: Skill) => void;
};

type EditProps = {
  mode: "edit";
  skill: Skill;
  trigger: React.ReactNode;
  onSuccess?: (skill: Skill) => void;
};

type Props = CreateProps | EditProps;

type FormValues = {
  name: string;
  category: string;
  description: string;
  is_certification: boolean;
  certifying_authority: string;
  is_archived: boolean;
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

export default function SkillFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const isEdit = props.mode === "edit";

  const defaultValues: FormValues = isEdit
    ? {
        name: props.skill.name,
        category: props.skill.category ?? "",
        description: props.skill.description ?? "",
        is_certification: props.skill.is_certification,
        certifying_authority: props.skill.certifying_authority ?? "",
        is_archived: props.skill.is_archived,
      }
    : {
        name: "",
        category: "",
        description: "",
        is_certification: false,
        certifying_authority: "",
        is_archived: false,
      };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? skillUpdateSchema : skillInsertSchema),
    defaultValues,
  });

  const isCert = watch("is_certification");
  const readOnly = useFormReadOnly();

  async function onSubmit(data: FormValues) {
    const result = isEdit ? await updateSkill(props.skill.id, data) : await createSkill(data);

    if (result.ok) {
      toast.success(isEdit ? "Skill updated" : "Skill added");
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
            {isEdit ? "Edit skill" : "Add skill"}
          </Dialog.Title>

          <ReadOnlyBanner />

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <Label htmlFor="name">Skill name *</Label>
              <input
                id="name"
                {...register("name")}
                className={fieldClass(!!errors.name)}
                placeholder="ACLS"
              />
              <FieldError message={errors.name?.message} />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <input
                id="category"
                {...register("category")}
                className={fieldClass(!!errors.category)}
                placeholder="clinical, technical, soft, …"
              />
              <FieldError message={errors.category?.message} />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={3}
                {...register("description")}
                className={fieldClass(!!errors.description)}
                placeholder="Optional description…"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                {...register("is_certification")}
                className="border-border h-4 w-4 rounded"
              />
              <span className="text-foreground text-sm font-medium">
                This is a certification (tracks expiry)
              </span>
            </label>

            {isCert && (
              <div>
                <Label htmlFor="certifying_authority">Certifying authority</Label>
                <input
                  id="certifying_authority"
                  {...register("certifying_authority")}
                  className={fieldClass(!!errors.certifying_authority)}
                  placeholder="American Heart Association"
                />
                <FieldError message={errors.certifying_authority?.message} />
              </div>
            )}

            {isEdit && (
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  {...register("is_archived")}
                  className="border-border h-4 w-4 rounded"
                />
                <span className="text-foreground text-sm">Archived</span>
              </label>
            )}

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
                  {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add skill"}
                </button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
