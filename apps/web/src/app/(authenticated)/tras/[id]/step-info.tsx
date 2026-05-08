"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TRA_URGENCY_VALUES } from "@arbor/shared";
import type { Tra, TraUrgency } from "@arbor/shared";
import { updateTra } from "../actions";

type Props = {
  tra: Tra;
  disabled: boolean;
};

function fieldClass(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
    error ? "border-destructive" : "border-input"
  }`;
}

export default function StepInfo({ tra, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [project_name, setProjectName] = useState(tra.project_name);
  const [description, setDescription] = useState(tra.description ?? "");
  const [requesting_department, setRequestingDepartment] = useState(
    tra.requesting_department ?? "",
  );
  const [stakeholder_name, setStakeholderName] = useState(tra.stakeholder_name ?? "");
  const [stakeholder_email, setStakeholderEmail] = useState(tra.stakeholder_email ?? "");
  const [business_justification, setBusinessJustification] = useState(
    tra.business_justification ?? "",
  );
  const [target_audience, setTargetAudience] = useState(tra.target_audience ?? "");
  const [urgency, setUrgency] = useState<TraUrgency>(tra.urgency);

  function save() {
    startTransition(async () => {
      const result = await updateTra(tra.id, {
        project_name,
        description: description || null,
        requesting_department: requesting_department || null,
        stakeholder_name: stakeholder_name || null,
        stakeholder_email: stakeholder_email || null,
        business_justification: business_justification || null,
        target_audience: target_audience || null,
        urgency,
      });
      if (result.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <label htmlFor="project_name" className="text-foreground mb-1 block text-sm font-medium">
          Project name *
        </label>
        <input
          id="project_name"
          value={project_name}
          onChange={(e) => {
            setProjectName(e.target.value);
          }}
          disabled={disabled}
          className={fieldClass()}
        />
      </div>

      <div>
        <label htmlFor="description" className="text-foreground mb-1 block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          disabled={disabled}
          className={fieldClass()}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor="requesting_department"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Requesting department
          </label>
          <input
            id="requesting_department"
            value={requesting_department}
            onChange={(e) => {
              setRequestingDepartment(e.target.value);
            }}
            disabled={disabled}
            className={fieldClass()}
          />
        </div>
        <div>
          <label
            htmlFor="stakeholder_name"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Stakeholder name
          </label>
          <input
            id="stakeholder_name"
            value={stakeholder_name}
            onChange={(e) => {
              setStakeholderName(e.target.value);
            }}
            disabled={disabled}
            className={fieldClass()}
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
            value={stakeholder_email}
            onChange={(e) => {
              setStakeholderEmail(e.target.value);
            }}
            disabled={disabled}
            className={fieldClass()}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="business_justification"
          className="text-foreground mb-1 block text-sm font-medium"
        >
          Business justification
        </label>
        <textarea
          id="business_justification"
          rows={4}
          value={business_justification}
          onChange={(e) => {
            setBusinessJustification(e.target.value);
          }}
          disabled={disabled}
          className={fieldClass()}
          placeholder="Why is this training needed? What's the expected outcome?"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="target_audience"
            className="text-foreground mb-1 block text-sm font-medium"
          >
            Target audience
          </label>
          <input
            id="target_audience"
            value={target_audience}
            onChange={(e) => {
              setTargetAudience(e.target.value);
            }}
            disabled={disabled}
            className={fieldClass()}
            placeholder="Who's being trained?"
          />
        </div>
        <div>
          <label htmlFor="urgency" className="text-foreground mb-1 block text-sm font-medium">
            Urgency
          </label>
          <select
            id="urgency"
            value={urgency}
            onChange={(e) => {
              setUrgency(e.target.value as TraUrgency);
            }}
            disabled={disabled}
            className={fieldClass()}
          >
            {TRA_URGENCY_VALUES.map((u) => (
              <option key={u} value={u} className="capitalize">
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={save}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
