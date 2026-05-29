"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Tra } from "@arbor/shared";
import { updateTra } from "../actions";
import { SaveBar, TextAreaField, TextField } from "./form-helpers";

type Props = {
  tra: Tra;
  disabled: boolean;
};

export default function Step7Sustainment({ tra, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  const [contentOwner, setContentOwner] = useState(tra.content_owner ?? "");
  const [reinforcement, setReinforcement] = useState(tra.reinforcement_plan ?? "");
  const [reviewCadence, setReviewCadence] = useState(tra.review_cadence ?? "");

  const dirty =
    contentOwner !== (tra.content_owner ?? "") ||
    reinforcement !== (tra.reinforcement_plan ?? "") ||
    reviewCadence !== (tra.review_cadence ?? "");

  function handleSave() {
    startTransition(async () => {
      const r = await updateTra(tra.id, {
        content_owner: contentOwner || null,
        reinforcement_plan: reinforcement || null,
        review_cadence: reviewCadence || null,
      });
      if (r.ok) toast.success("Saved");
      else toast.error(r.error.message);
    });
  }

  function handleDiscard() {
    setContentOwner(tra.content_owner ?? "");
    setReinforcement(tra.reinforcement_plan ?? "");
    setReviewCadence(tra.review_cadence ?? "");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">How does this stay current after the rollout?</p>

      <TextField
        label="Content owner post-launch"
        value={contentOwner}
        onChange={setContentOwner}
        disabled={disabled}
        hint="Who owns updates after we ship"
      />

      <TextAreaField
        label="Reinforcement plan"
        value={reinforcement}
        onChange={setReinforcement}
        disabled={disabled}
        rows={4}
        hint="Job aids, refresher cadence, on-the-floor coaching, performance support tools"
      />

      <TextField
        label="Review cadence"
        value={reviewCadence}
        onChange={setReviewCadence}
        disabled={disabled}
        hint="e.g. Quarterly, annually, on guideline change"
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
