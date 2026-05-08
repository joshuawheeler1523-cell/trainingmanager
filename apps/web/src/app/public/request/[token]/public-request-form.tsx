"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import {
  publicSubmitSchema,
  REQUEST_URGENCY_VALUES,
  type PublicSubmitInput,
  type RequestUrgency,
} from "@arbor/shared";
import { submitPublicRequest } from "./actions";

type FormValues = {
  title: string;
  requested_by_name: string;
  requested_by_email: string;
  requested_by_department: string;
  business_justification: string;
  target_audience: string;
  urgency: RequestUrgency;
  target_completion_date: string;
};

type Submitted = { tracking_id: string };

function fieldClass(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
    error ? "border-destructive" : "border-input"
  }`;
}

export default function PublicRequestForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(publicSubmitSchema),
    defaultValues: {
      title: "",
      requested_by_name: "",
      requested_by_email: "",
      requested_by_department: "",
      business_justification: "",
      target_audience: "",
      urgency: "standard",
      target_completion_date: "",
    },
  });

  function onSubmit(values: FormValues) {
    setServerError(null);
    const payload: PublicSubmitInput = {
      ...values,
      requested_by_department: values.requested_by_department || null,
      business_justification: values.business_justification || null,
      target_audience: values.target_audience || null,
      target_completion_date: values.target_completion_date || null,
    };
    startTransition(async () => {
      const result = await submitPublicRequest(token, payload);
      if (result.ok) {
        setSubmitted(result.data);
      } else {
        setServerError(result.error.message);
      }
    });
  }

  if (submitted) {
    return (
      <div className="text-center">
        <CheckCircleIcon className="mx-auto h-10 w-10 text-emerald-500" />
        <h2 className="text-foreground mt-3 text-lg font-semibold">Request submitted</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Thanks for the details. The training team will review and follow up by email.
        </p>
        <p className="text-muted-foreground mt-4 text-xs">
          Tracking ID:{" "}
          <code className="bg-surface text-foreground rounded px-1.5 py-0.5 font-mono">
            {submitted.tracking_id}
          </code>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="space-y-4"
    >
      {serverError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {serverError}
        </div>
      )}

      <div>
        <label htmlFor="title" className="text-foreground mb-1 block text-sm font-medium">
          What training do you need? *
        </label>
        <input
          id="title"
          {...register("title")}
          className={fieldClass(!!errors.title)}
          placeholder="e.g. New EMR documentation basics"
        />
        {errors.title && <p className="text-destructive mt-1 text-xs">{errors.title.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="requested_by_name"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Your name *
          </label>
          <input
            id="requested_by_name"
            {...register("requested_by_name")}
            className={fieldClass(!!errors.requested_by_name)}
          />
          {errors.requested_by_name && (
            <p className="text-destructive mt-1 text-xs">{errors.requested_by_name.message}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="requested_by_email"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Your email *
          </label>
          <input
            id="requested_by_email"
            type="email"
            {...register("requested_by_email")}
            className={fieldClass(!!errors.requested_by_email)}
          />
          {errors.requested_by_email && (
            <p className="text-destructive mt-1 text-xs">{errors.requested_by_email.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="requested_by_department"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Department
          </label>
          <input
            id="requested_by_department"
            {...register("requested_by_department")}
            className={fieldClass()}
          />
        </div>
        <div>
          <label
            htmlFor="target_audience"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Who needs the training?
          </label>
          <input
            id="target_audience"
            {...register("target_audience")}
            className={fieldClass()}
            placeholder="e.g. New nurses on Med-Surg"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="business_justification"
          className="text-foreground mb-1 block text-sm font-medium"
        >
          Why is this training needed?
        </label>
        <textarea
          id="business_justification"
          rows={4}
          {...register("business_justification")}
          className={fieldClass()}
          placeholder="What's the impact? When does it need to happen?"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="urgency" className="text-foreground mb-1 block text-sm font-medium">
            Urgency
          </label>
          <select id="urgency" {...register("urgency")} className={fieldClass()}>
            {REQUEST_URGENCY_VALUES.map((u) => (
              <option key={u} value={u} className="capitalize">
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="target_completion_date"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Target completion date
          </label>
          <input
            id="target_completion_date"
            type="date"
            {...register("target_completion_date")}
            className={fieldClass()}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || pending}
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {isSubmitting || pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
