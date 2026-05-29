"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TRA_ROOT_CAUSE_VALUES, type Tra, type TraRootCauseAnswer } from "@arbor/shared";
import { updateTra } from "../actions";
import { SaveBar, SelectField, TextAreaField } from "./form-helpers";

type Props = {
  tra: Tra;
  disabled: boolean;
};

export default function Step2Need({ tra, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  const [businessProblem, setBusinessProblem] = useState(tra.business_problem ?? "");
  const [currentBehavior, setCurrentBehavior] = useState(tra.current_behavior ?? "");
  const [desiredBehavior, setDesiredBehavior] = useState(tra.desired_behavior ?? "");
  const [rootCause, setRootCause] = useState<TraRootCauseAnswer | "">(tra.root_cause_answer ?? "");
  const [rootCauseJustification, setRootCauseJustification] = useState(
    tra.root_cause_justification ?? "",
  );
  const [priorAttempts, setPriorAttempts] = useState(tra.prior_attempts ?? "");
  const [costOfInaction, setCostOfInaction] = useState(tra.cost_of_inaction ?? "");

  const dirty =
    businessProblem !== (tra.business_problem ?? "") ||
    currentBehavior !== (tra.current_behavior ?? "") ||
    desiredBehavior !== (tra.desired_behavior ?? "") ||
    rootCause !== (tra.root_cause_answer ?? "") ||
    rootCauseJustification !== (tra.root_cause_justification ?? "") ||
    priorAttempts !== (tra.prior_attempts ?? "") ||
    costOfInaction !== (tra.cost_of_inaction ?? "");

  const justificationRequired = rootCause === "maybe" || rootCause === "no";

  function handleSave() {
    if (justificationRequired && !rootCauseJustification.trim()) {
      toast.error("Justification is required when training isn't the right fix.");
      return;
    }
    startTransition(async () => {
      const r = await updateTra(tra.id, {
        business_problem: businessProblem || null,
        current_behavior: currentBehavior || null,
        desired_behavior: desiredBehavior || null,
        root_cause_answer: rootCause || null,
        root_cause_justification: rootCauseJustification || null,
        prior_attempts: priorAttempts || null,
        cost_of_inaction: costOfInaction || null,
      });
      if (r.ok) toast.success("Saved");
      else toast.error(r.error.message);
    });
  }

  function handleDiscard() {
    setBusinessProblem(tra.business_problem ?? "");
    setCurrentBehavior(tra.current_behavior ?? "");
    setDesiredBehavior(tra.desired_behavior ?? "");
    setRootCause(tra.root_cause_answer ?? "");
    setRootCauseJustification(tra.root_cause_justification ?? "");
    setPriorAttempts(tra.prior_attempts ?? "");
    setCostOfInaction(tra.cost_of_inaction ?? "");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        What problem are we solving — and is training the right fix?
      </p>

      <TextAreaField
        label="Business problem"
        value={businessProblem}
        onChange={setBusinessProblem}
        disabled={disabled}
        rows={4}
        required
        hint="What's broken or missing? Required to submit."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextAreaField
          label="Current behavior"
          value={currentBehavior}
          onChange={setCurrentBehavior}
          disabled={disabled}
          rows={3}
          hint="What people do today"
        />
        <TextAreaField
          label="Desired behavior"
          value={desiredBehavior}
          onChange={setDesiredBehavior}
          disabled={disabled}
          rows={3}
          hint="What should they do instead"
        />
      </div>

      <SelectField
        label="Is training the right fix?"
        value={rootCause}
        onChange={setRootCause}
        disabled={disabled}
        required
        options={TRA_ROOT_CAUSE_VALUES.map((v) => ({
          value: v,
          label:
            v === "yes"
              ? "Yes — training is the right fix"
              : v === "maybe"
                ? "Maybe — needs further diagnosis"
                : "No — different intervention needed",
        }))}
      />

      {justificationRequired && (
        <TextAreaField
          label="Justification"
          value={rootCauseJustification}
          onChange={setRootCauseJustification}
          disabled={disabled}
          rows={3}
          required
          hint="Explain — required when not 'Yes'"
        />
      )}

      <TextAreaField
        label="Prior attempts"
        value={priorAttempts}
        onChange={setPriorAttempts}
        disabled={disabled}
        rows={3}
        hint="What's been tried before, and what happened?"
      />

      <TextAreaField
        label="Cost of inaction"
        value={costOfInaction}
        onChange={setCostOfInaction}
        disabled={disabled}
        rows={3}
        required
        hint="What happens if nothing changes? Required to submit."
      />

      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={handleSave}
        onDiscard={handleDiscard}
        disabled={disabled}
      />
    </div>
  );
}
