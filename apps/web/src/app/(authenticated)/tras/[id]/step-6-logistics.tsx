"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TRA_WCAG_TARGET_VALUES, type Tra, type TraWcagTarget } from "@arbor/shared";
import { updateTra } from "../actions";
import { SaveBar, SelectField, TextAreaField } from "./form-helpers";

type Props = {
  tra: Tra;
  disabled: boolean;
};

export default function Step6Logistics({ tra, disabled }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [tech, setTech] = useState(tra.technology_requirements ?? "");
  const [wcag, setWcag] = useState<TraWcagTarget | "">(tra.wcag_target ?? "");
  const [localization, setLocalization] = useState(tra.localization_needs ?? "");
  const [constraints, setConstraints] = useState(tra.constraints_notes ?? "");
  const [pilot, setPilot] = useState(tra.pilot_group ?? "");
  const [feedback, setFeedback] = useState(tra.feedback_mechanism ?? "");

  const dirty =
    tech !== (tra.technology_requirements ?? "") ||
    wcag !== (tra.wcag_target ?? "") ||
    localization !== (tra.localization_needs ?? "") ||
    constraints !== (tra.constraints_notes ?? "") ||
    pilot !== (tra.pilot_group ?? "") ||
    feedback !== (tra.feedback_mechanism ?? "");

  function handleSave() {
    startTransition(async () => {
      const r = await updateTra(tra.id, {
        technology_requirements: tech || null,
        wcag_target: wcag || null,
        localization_needs: localization || null,
        constraints_notes: constraints || null,
        pilot_group: pilot || null,
        feedback_mechanism: feedback || null,
      });
      if (r.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  function handleDiscard() {
    setTech(tra.technology_requirements ?? "");
    setWcag(tra.wcag_target ?? "");
    setLocalization(tra.localization_needs ?? "");
    setConstraints(tra.constraints_notes ?? "");
    setPilot(tra.pilot_group ?? "");
    setFeedback(tra.feedback_mechanism ?? "");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Operational logistics — what the build and rollout will actually require.
      </p>

      <TextAreaField
        label="Technology requirements"
        value={tech}
        onChange={setTech}
        disabled={disabled}
        rows={3}
        hint="LMS, simulation lab, AR/VR hardware, video platform, etc."
      />

      <SelectField
        label="Accessibility conformance target"
        value={wcag}
        onChange={setWcag}
        disabled={disabled}
        options={TRA_WCAG_TARGET_VALUES.map((v) => ({
          value: v,
          label:
            v === "section_508" ? "Section 508" : v === "none" ? "None" : `WCAG ${v.toUpperCase()}`,
        }))}
        hint="Pick the conformance bar — orgs with federal funding usually need Section 508 or WCAG AA"
      />

      <TextAreaField
        label="Localization needs"
        value={localization}
        onChange={setLocalization}
        disabled={disabled}
        rows={3}
        hint="Languages, regional examples, units, voice-overs"
      />

      <TextAreaField
        label="Constraints"
        value={constraints}
        onChange={setConstraints}
        disabled={disabled}
        rows={4}
        hint="Blackout periods, travel limits, system-access caps, union/WC rules"
      />

      <TextAreaField
        label="Pilot group"
        value={pilot}
        onChange={setPilot}
        disabled={disabled}
        rows={2}
        hint="Who tests the first version, where"
      />

      <TextAreaField
        label="Feedback mechanism"
        value={feedback}
        onChange={setFeedback}
        disabled={disabled}
        rows={2}
        hint="How do learners and SMEs flag issues during pilot?"
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
