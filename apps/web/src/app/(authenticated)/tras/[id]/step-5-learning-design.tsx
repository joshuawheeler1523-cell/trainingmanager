"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  TRA_DELIVERY_CADENCE_VALUES,
  TRA_MODALITY_VALUES,
  checkObjective,
  type DeliverableType,
  type Tra,
  type TraDeliveryCadence,
  type TraDeliverable,
  type TraEvaluationPlan,
  type TraModality,
  type TraObjective,
  type TraSme,
} from "@arbor/shared";
import { saveTraEvaluationPlan, saveTraObjectives, saveTraSmes, updateTra } from "../actions";
import StepDeliverables from "./step-deliverables";
import {
  MultiCheckField,
  RemoveRowButton,
  RepeatableSection,
  SaveBar,
  SelectField,
  TagInputField,
  TextAreaField,
  TextField,
} from "./form-helpers";

type ObjectiveRow = { text: string };
type SmeRow = { name: string; email: string; availability_hours: string };
type EvalRow = {
  level: 1 | 2 | 3 | 4;
  enabled: boolean;
  measurement_method: string;
};

const KIRKPATRICK_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Level 1 — Reaction (did learners enjoy / engage?)",
  2: "Level 2 — Learning (did they actually learn it?)",
  3: "Level 3 — Behavior (are they using it on the job?)",
  4: "Level 4 — Results (did the business outcome move?)",
};

const MODALITY_LABELS: Record<TraModality, string> = {
  ilt: "ILT (instructor-led)",
  vilt: "vILT (virtual ILT)",
  elearning: "Self-paced eLearning",
  blended: "Blended",
  microlearning: "Microlearning",
  job_aid: "Job aid",
  coaching: "Coaching",
};

type Props = {
  tra: Tra;
  objectives: TraObjective[];
  smes: TraSme[];
  evaluationPlan: TraEvaluationPlan[];
  deliverables: TraDeliverable[];
  deliverableTypes: DeliverableType[];
  disabled: boolean;
};

export default function Step5LearningDesign({
  tra,
  objectives,
  smes,
  evaluationPlan,
  deliverables,
  deliverableTypes,
  disabled,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialObjectives = useMemo<ObjectiveRow[]>(
    () =>
      [...objectives].sort((a, b) => a.position - b.position).map((o) => ({ text: o.text ?? "" })),
    [objectives],
  );
  const initialSmes = useMemo<SmeRow[]>(
    () =>
      [...smes]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          name: s.name ?? "",
          email: s.email ?? "",
          availability_hours: s.availability_hours != null ? String(s.availability_hours) : "",
        })),
    [smes],
  );
  const initialEval = useMemo<EvalRow[]>(() => {
    const byLevel = new Map(evaluationPlan.map((e) => [e.kirkpatrick_level, e]));
    return [1, 2, 3, 4].map((level) => {
      const lv = level as 1 | 2 | 3 | 4;
      const existing = byLevel.get(lv);
      return {
        level: lv,
        enabled: existing != null,
        measurement_method: existing?.measurement_method ?? "",
      };
    });
  }, [evaluationPlan]);

  const [objectiveRows, setObjectiveRows] = useState<ObjectiveRow[]>(initialObjectives);
  const [smeRows, setSmeRows] = useState<SmeRow[]>(initialSmes);
  const [evalRows, setEvalRows] = useState<EvalRow[]>(initialEval);

  const [existingContent, setExistingContent] = useState(tra.existing_content ?? "");
  const [modalities, setModalities] = useState<TraModality[]>(tra.recommended_modalities);
  const [seatTime, setSeatTime] = useState(
    tra.estimated_seat_time_hours != null ? String(tra.estimated_seat_time_hours) : "",
  );
  const [cadence, setCadence] = useState<TraDeliveryCadence | "">(tra.delivery_cadence ?? "");
  const [assessmentApproaches, setAssessmentApproaches] = useState<string[]>(
    tra.assessment_approaches,
  );

  const dirty =
    JSON.stringify(objectiveRows) !== JSON.stringify(initialObjectives) ||
    JSON.stringify(smeRows) !== JSON.stringify(initialSmes) ||
    JSON.stringify(evalRows) !== JSON.stringify(initialEval) ||
    existingContent !== (tra.existing_content ?? "") ||
    JSON.stringify(modalities) !== JSON.stringify(tra.recommended_modalities) ||
    seatTime !==
      (tra.estimated_seat_time_hours != null ? String(tra.estimated_seat_time_hours) : "") ||
    cadence !== (tra.delivery_cadence ?? "") ||
    JSON.stringify(assessmentApproaches) !== JSON.stringify(tra.assessment_approaches);

  function handleSave() {
    startTransition(async () => {
      const traUpdate = await updateTra(tra.id, {
        existing_content: existingContent || null,
        recommended_modalities: modalities,
        estimated_seat_time_hours: seatTime === "" ? null : Number(seatTime),
        delivery_cadence: cadence || null,
        assessment_approaches: assessmentApproaches,
      });
      if (!traUpdate.ok) {
        toast.error(traUpdate.error.message);
        return;
      }
      const objSave = await saveTraObjectives(
        tra.id,
        objectiveRows
          .filter((r) => r.text.trim() !== "")
          .map((r, i) => ({ position: i, text: r.text })),
      );
      if (!objSave.ok) {
        toast.error(objSave.error.message);
        return;
      }
      const smeSave = await saveTraSmes(
        tra.id,
        smeRows.map((r, i) => ({
          position: i,
          name: r.name || null,
          email: r.email || null,
          availability_hours: r.availability_hours === "" ? null : Number(r.availability_hours),
        })),
      );
      if (!smeSave.ok) {
        toast.error(smeSave.error.message);
        return;
      }
      const evalSave = await saveTraEvaluationPlan(
        tra.id,
        evalRows
          .filter((r) => r.enabled)
          .map((r) => ({
            kirkpatrick_level: r.level,
            measurement_method: r.measurement_method || null,
          })),
      );
      if (!evalSave.ok) {
        toast.error(evalSave.error.message);
        return;
      }
      toast.success("Saved");
      router.refresh();
    });
  }

  function handleDiscard() {
    setObjectiveRows(initialObjectives);
    setSmeRows(initialSmes);
    setEvalRows(initialEval);
    setExistingContent(tra.existing_content ?? "");
    setModalities(tra.recommended_modalities);
    setSeatTime(tra.estimated_seat_time_hours != null ? String(tra.estimated_seat_time_hours) : "");
    setCadence(tra.delivery_cadence ?? "");
    setAssessmentApproaches(tra.assessment_approaches);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">How will the learning happen?</p>

      <RepeatableSection<ObjectiveRow>
        label="Learning objectives"
        rows={objectiveRows}
        onChange={setObjectiveRows}
        disabled={disabled}
        addLabel="Add objective"
        newRow={() => ({ text: "" })}
        renderRow={(row, update, remove, idx) => {
          const check = row.text.trim() ? checkObjective(row.text) : { ok: true as const };
          return (
            <div className="border-border bg-background rounded-md border p-2">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground pt-2 text-xs tabular-nums">{idx + 1}.</span>
                <input
                  type="text"
                  placeholder="Learner will demonstrate / calculate / evaluate / …"
                  value={row.text}
                  disabled={disabled}
                  onChange={(e) => {
                    update({ text: e.target.value });
                  }}
                  className="border-input bg-background text-foreground flex-1 rounded-md border px-2 py-1.5 text-sm"
                />
                <RemoveRowButton onClick={remove} disabled={disabled} />
              </div>
              {!check.ok && (
                <p className="mt-1 pl-6 text-xs text-amber-600 dark:text-amber-400">
                  {check.reason === "weak_phrase"
                    ? `Avoid "${check.phrase}" — it describes an internal state that can't be observed. Try a Bloom-style verb (demonstrate, perform, evaluate, …).`
                    : "No observable verb detected. Try starting with a Bloom-style verb like 'demonstrate', 'calculate', 'evaluate'."}
                </p>
              )}
            </div>
          );
        }}
      />

      <RepeatableSection<SmeRow>
        label="Subject matter experts"
        rows={smeRows}
        onChange={setSmeRows}
        disabled={disabled}
        addLabel="Add SME"
        newRow={() => ({ name: "", email: "", availability_hours: "" })}
        renderRow={(row, update, remove) => (
          <div className="border-border bg-background flex items-center gap-2 rounded-md border p-2">
            <input
              type="text"
              placeholder="Name"
              value={row.name}
              disabled={disabled}
              onChange={(e) => {
                update({ ...row, name: e.target.value });
              }}
              className="border-input bg-background text-foreground flex-1 rounded-md border px-2 py-1.5 text-sm"
            />
            <input
              type="email"
              placeholder="Email"
              value={row.email}
              disabled={disabled}
              onChange={(e) => {
                update({ ...row, email: e.target.value });
              }}
              className="border-input bg-background text-foreground flex-1 rounded-md border px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              placeholder="Hours / week"
              min={0}
              step={0.5}
              value={row.availability_hours}
              disabled={disabled}
              onChange={(e) => {
                update({ ...row, availability_hours: e.target.value });
              }}
              className="border-input bg-background text-foreground w-32 rounded-md border px-2 py-1.5 text-sm"
            />
            <RemoveRowButton onClick={remove} disabled={disabled} />
          </div>
        )}
      />

      <TextAreaField
        label="Existing content to build from"
        value={existingContent}
        onChange={setExistingContent}
        disabled={disabled}
        rows={3}
        hint="Anything we can reuse — manuals, slides, vendor courseware, prior cohorts"
      />

      <MultiCheckField<TraModality>
        label="Recommended modalities"
        values={modalities}
        onChange={setModalities}
        disabled={disabled}
        options={TRA_MODALITY_VALUES.map((v) => ({ value: v, label: MODALITY_LABELS[v] }))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Estimated seat time (hours)"
          value={seatTime}
          onChange={setSeatTime}
          type="number"
          disabled={disabled}
          hint="Top-level rough estimate — deliverables below are the line-by-line breakdown"
        />
        <SelectField
          label="Delivery cadence"
          value={cadence}
          onChange={setCadence}
          disabled={disabled}
          options={TRA_DELIVERY_CADENCE_VALUES.map((v) => ({
            value: v,
            label:
              v === "one_time"
                ? "One-time"
                : v === "cohort"
                  ? "Cohort"
                  : v === "always_on"
                    ? "Always-on"
                    : "Recurring",
          }))}
        />
      </div>

      <TagInputField
        label="Assessment approach"
        values={assessmentApproaches}
        onChange={setAssessmentApproaches}
        disabled={disabled}
        placeholder="e.g. Knowledge check, skill demo, supervisor sign-off"
      />

      <div>
        <p className="text-foreground mb-2 text-xs font-medium">
          Evaluation plan — Kirkpatrick levels
        </p>
        <div className="space-y-2">
          {evalRows.map((row, idx) => (
            <div
              key={row.level}
              className="border-border bg-background flex items-start gap-2 rounded-md border p-2"
            >
              <label className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={disabled}
                  onChange={(e) => {
                    setEvalRows((rows) =>
                      rows.map((r, i) => (i === idx ? { ...r, enabled: e.target.checked } : r)),
                    );
                  }}
                  className="border-border h-4 w-4 rounded"
                />
                <span className="text-foreground text-xs font-medium">
                  {KIRKPATRICK_LABELS[row.level]}
                </span>
              </label>
              {row.enabled && (
                <input
                  type="text"
                  placeholder="Measurement method"
                  value={row.measurement_method}
                  disabled={disabled}
                  onChange={(e) => {
                    setEvalRows((rows) =>
                      rows.map((r, i) =>
                        i === idx ? { ...r, measurement_method: e.target.value } : r,
                      ),
                    );
                  }}
                  className="border-input bg-background text-foreground ml-auto flex-1 rounded-md border px-2 py-1.5 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={handleSave}
        onDiscard={handleDiscard}
        disabled={disabled}
      />

      <div className="border-border my-6 border-t" />
      <h4 className="text-foreground text-sm font-semibold">Deliverables breakdown</h4>
      <p className="text-muted-foreground text-xs">
        Per-deliverable estimation. Auto-calculates total hours on the intake.
      </p>
      <StepDeliverables
        traId={tra.id}
        deliverables={deliverables}
        deliverableTypes={deliverableTypes}
        disabled={disabled}
      />
    </div>
  );
}
