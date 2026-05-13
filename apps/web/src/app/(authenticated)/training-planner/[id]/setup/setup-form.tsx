"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { implementationSetupSchema, type Implementation } from "@arbor/shared";
import { setStep, updateImplementationSetup } from "../../actions";

type Props = {
  implementation: Implementation;
  projects: { id: string; name: string }[];
  tras: { id: string; project_name: string }[];
};

type FormValues = {
  name: string;
  description: string;
  window_start_date: string;
  window_end_date: string;
  go_live_date: string;
  linked_project_id: string;
  linked_tra_id: string;
  lunch_break_start_minutes: number;
  lunch_break_length_minutes: number;
  go_live_buffer_days: number;
  business_hours_start_local: number;
  business_hours_end_local: number;
};

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function SetupForm({ implementation, projects, tras }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(implementationSetupSchema),
    defaultValues: {
      name: implementation.name,
      description: implementation.description ?? "",
      window_start_date: implementation.window_start_date ?? "",
      window_end_date: implementation.window_end_date ?? "",
      go_live_date: implementation.go_live_date ?? "",
      linked_project_id: implementation.linked_project_id ?? "",
      linked_tra_id: implementation.linked_tra_id ?? "",
      lunch_break_start_minutes: implementation.lunch_break_start_minutes,
      lunch_break_length_minutes: implementation.lunch_break_length_minutes,
      go_live_buffer_days: implementation.go_live_buffer_days,
      business_hours_start_local: implementation.business_hours_start_local,
      business_hours_end_local: implementation.business_hours_end_local,
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        ...values,
        description: values.description || null,
        linked_project_id: values.linked_project_id || null,
        linked_tra_id: values.linked_tra_id || null,
      };
      const result = await updateImplementationSetup(implementation.id, payload);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      await setStep(implementation.id, 2);
      toast.success("Setup saved");
      router.push(`/training-planner/${implementation.id}/rooms`);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="max-w-2xl space-y-4"
    >
      <div>
        <label htmlFor="name" className="text-foreground mb-1 block text-xs font-medium">
          Implementation name *
        </label>
        <input id="name" {...register("name")} className={fieldClass} />
        {errors.name && <p className="text-destructive mt-1 text-xs">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="description" className="text-foreground mb-1 block text-xs font-medium">
          Description
        </label>
        <textarea id="description" rows={3} {...register("description")} className={fieldClass} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label
            htmlFor="window_start_date"
            className="text-foreground mb-1 block text-xs font-medium"
          >
            Window start *
          </label>
          <input
            id="window_start_date"
            type="date"
            {...register("window_start_date")}
            className={fieldClass}
          />
          {errors.window_start_date && (
            <p className="text-destructive mt-1 text-xs">{errors.window_start_date.message}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="window_end_date"
            className="text-foreground mb-1 block text-xs font-medium"
          >
            Window end *
          </label>
          <input
            id="window_end_date"
            type="date"
            {...register("window_end_date")}
            className={fieldClass}
          />
          {errors.window_end_date && (
            <p className="text-destructive mt-1 text-xs">{errors.window_end_date.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="go_live_date" className="text-foreground mb-1 block text-xs font-medium">
            Go-live date *
          </label>
          <input
            id="go_live_date"
            type="date"
            {...register("go_live_date")}
            className={fieldClass}
          />
          {errors.go_live_date && (
            <p className="text-destructive mt-1 text-xs">{errors.go_live_date.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor="linked_project_id"
            className="text-foreground mb-1 block text-xs font-medium"
          >
            Linked Special Project
          </label>
          <select id="linked_project_id" {...register("linked_project_id")} className={fieldClass}>
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="linked_tra_id" className="text-foreground mb-1 block text-xs font-medium">
            Linked TRA
          </label>
          <select id="linked_tra_id" {...register("linked_tra_id")} className={fieldClass}>
            <option value="">— None —</option>
            {tras.map((t) => (
              <option key={t.id} value={t.id}>
                {t.project_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-border border-t pt-4">
        <p className="text-foreground text-sm font-semibold">Daily schedule</p>
        <p className="text-muted-foreground mb-2 text-xs">
          Used by the scheduler to leave room for lunch. Per-room day start times are configured on
          the Rooms step.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="lunch_break_start_minutes"
              className="text-foreground mb-1 block text-xs font-medium"
            >
              Lunch start (minutes from local midnight)
            </label>
            <input
              id="lunch_break_start_minutes"
              type="number"
              min={0}
              max={1439}
              step={15}
              {...register("lunch_break_start_minutes", { valueAsNumber: true })}
              className={fieldClass}
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              720 = 12:00 noon · 750 = 12:30 PM
            </p>
          </div>
          <div>
            <label
              htmlFor="lunch_break_length_minutes"
              className="text-foreground mb-1 block text-xs font-medium"
            >
              Lunch length (minutes; 0 disables)
            </label>
            <input
              id="lunch_break_length_minutes"
              type="number"
              min={0}
              max={240}
              step={15}
              {...register("lunch_break_length_minutes", { valueAsNumber: true })}
              className={fieldClass}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="business_hours_start_local"
              className="text-foreground mb-1 block text-xs font-medium"
            >
              Earliest start hour
            </label>
            <input
              id="business_hours_start_local"
              type="number"
              min={0}
              max={24}
              step={0.25}
              {...register("business_hours_start_local", { valueAsNumber: true })}
              className={fieldClass}
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              8 = 8:00 AM, 8.5 = 8:30 AM. 0 = no earliest-start limit (per-room defaults apply).
            </p>
          </div>
          <div>
            <label
              htmlFor="business_hours_end_local"
              className="text-foreground mb-1 block text-xs font-medium"
            >
              Latest end hour
            </label>
            <input
              id="business_hours_end_local"
              type="number"
              min={0}
              max={24}
              step={0.25}
              {...register("business_hours_end_local", { valueAsNumber: true })}
              className={fieldClass}
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              17 = 5:00 PM. 24 = no end limit. Sessions must finish (wall clock) by this hour.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="go_live_buffer_days"
            className="text-foreground mb-1 block text-xs font-medium"
          >
            Go-live buffer (days)
          </label>
          <input
            id="go_live_buffer_days"
            type="number"
            min={0}
            max={365}
            {...register("go_live_buffer_days", { valueAsNumber: true })}
            className={fieldClass}
          />
          <p className="text-muted-foreground mt-1 text-[11px]">
            The scheduler won&apos;t place sessions in the final N days before go-live, leaving
            slack for makeups and no-shows. Set to 0 to disable.
          </p>
        </div>
      </div>

      <div className="border-border flex items-center justify-end gap-2 border-t pt-4">
        <button
          type="submit"
          disabled={pending || isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending || isSubmitting ? "Saving…" : "Save & continue"}
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
