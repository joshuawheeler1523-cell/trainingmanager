"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  TRA_PRIORITY_VALUES,
  TRA_SUCCESS_CHECKPOINT_VALUES,
  type Tra,
  type TraKpi,
  type TraPriority,
  type TraSuccessCheckpoint,
  type TraSuccessCriteria,
} from "@arbor/shared";
import { saveTraKpis, saveTraSuccessCriteria, updateTra } from "../actions";
import {
  RemoveRowButton,
  RepeatableSection,
  SaveBar,
  SelectField,
  TextField,
} from "./form-helpers";

type KpiRow = { metric: string; baseline: string; target: string };
type SuccessRow = {
  checkpoint: TraSuccessCheckpoint;
  criteria: string;
  measurement_owner: string;
};

type Props = {
  tra: Tra;
  kpis: TraKpi[];
  successCriteria: TraSuccessCriteria[];
  disabled: boolean;
};

export default function Step4BusinessCase({ tra, kpis, successCriteria, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  const initialKpis = useMemo<KpiRow[]>(
    () =>
      [...kpis]
        .sort((a, b) => a.position - b.position)
        .map((k) => ({
          metric: k.metric ?? "",
          baseline: k.baseline ?? "",
          target: k.target ?? "",
        })),
    [kpis],
  );
  const initialSuccess = useMemo<SuccessRow[]>(() => {
    const byCheckpoint = new Map(successCriteria.map((s) => [s.checkpoint, s]));
    return TRA_SUCCESS_CHECKPOINT_VALUES.map((c) => {
      const existing = byCheckpoint.get(c);
      return {
        checkpoint: c,
        criteria: existing?.criteria ?? "",
        measurement_owner: existing?.measurement_owner ?? "",
      };
    });
  }, [successCriteria]);

  const [kpiRows, setKpiRows] = useState<KpiRow[]>(initialKpis);
  const [successRows, setSuccessRows] = useState<SuccessRow[]>(initialSuccess);
  const [priority, setPriority] = useState<TraPriority | "">(tra.priority ?? "");
  const [budgetRange, setBudgetRange] = useState(tra.budget_range ?? "");
  const [fundingSource, setFundingSource] = useState(tra.funding_source ?? "");

  const dirty =
    JSON.stringify(kpiRows) !== JSON.stringify(initialKpis) ||
    JSON.stringify(successRows) !== JSON.stringify(initialSuccess) ||
    priority !== (tra.priority ?? "") ||
    budgetRange !== (tra.budget_range ?? "") ||
    fundingSource !== (tra.funding_source ?? "");

  function handleSave() {
    startTransition(async () => {
      const traUpdate = await updateTra(tra.id, {
        priority: priority || null,
        budget_range: budgetRange || null,
        funding_source: fundingSource || null,
      });
      if (!traUpdate.ok) {
        toast.error(traUpdate.error.message);
        return;
      }
      const kpiSave = await saveTraKpis(
        tra.id,
        kpiRows.map((r, i) => ({
          position: i,
          metric: r.metric || null,
          baseline: r.baseline || null,
          target: r.target || null,
        })),
      );
      if (!kpiSave.ok) {
        toast.error(kpiSave.error.message);
        return;
      }
      // Drop empty success-criteria rows so we don't insert blank ones for
      // checkpoints the user didn't fill in.
      const successPayload = successRows
        .filter((r) => r.criteria.trim() !== "" || r.measurement_owner.trim() !== "")
        .map((r) => ({
          checkpoint: r.checkpoint,
          criteria: r.criteria || null,
          measurement_owner: r.measurement_owner || null,
        }));
      const successSave = await saveTraSuccessCriteria(tra.id, successPayload);
      if (!successSave.ok) {
        toast.error(successSave.error.message);
        return;
      }
      toast.success("Saved");
    });
  }

  function handleDiscard() {
    setKpiRows(initialKpis);
    setSuccessRows(initialSuccess);
    setPriority(tra.priority ?? "");
    setBudgetRange(tra.budget_range ?? "");
    setFundingSource(tra.funding_source ?? "");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Why does this matter, and how will we know it worked?
      </p>

      <SelectField
        label="Priority"
        value={priority}
        onChange={setPriority}
        disabled={disabled}
        required
        options={TRA_PRIORITY_VALUES.map((p) => ({
          value: p,
          label:
            p === "nice_to_have"
              ? "Nice to have"
              : p === "important"
                ? "Important"
                : "Regulatory / compliance",
        }))}
        hint="Required to submit."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Budget range"
          value={budgetRange}
          onChange={setBudgetRange}
          disabled={disabled}
          hint="e.g. $20k-$40k or 'tbd'"
        />
        <TextField
          label="Funding source"
          value={fundingSource}
          onChange={setFundingSource}
          disabled={disabled}
          hint="Who pays?"
        />
      </div>

      <RepeatableSection<KpiRow>
        label="KPIs / metrics that will move"
        rows={kpiRows}
        onChange={setKpiRows}
        disabled={disabled}
        addLabel="Add KPI"
        newRow={() => ({ metric: "", baseline: "", target: "" })}
        renderRow={(row, update, remove) => (
          <div className="border-border bg-background flex items-start gap-2 rounded-md border p-2">
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Metric"
                value={row.metric}
                disabled={disabled}
                onChange={(e) => {
                  update({ ...row, metric: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Baseline"
                value={row.baseline}
                disabled={disabled}
                onChange={(e) => {
                  update({ ...row, baseline: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Target"
                value={row.target}
                disabled={disabled}
                onChange={(e) => {
                  update({ ...row, target: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
            <RemoveRowButton onClick={remove} disabled={disabled} />
          </div>
        )}
      />

      <div>
        <p className="text-foreground mb-2 text-xs font-medium">
          Success criteria — 30 / 90 / 180 day checkpoints
        </p>
        <div className="space-y-2">
          {successRows.map((row, idx) => (
            <div
              key={row.checkpoint}
              className="border-border bg-background grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[80px_1fr_1fr]"
            >
              <span className="text-muted-foreground self-center text-xs font-medium">
                {row.checkpoint} days
              </span>
              <input
                type="text"
                placeholder="Criteria — what good looks like"
                value={row.criteria}
                disabled={disabled}
                onChange={(e) => {
                  setSuccessRows((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, criteria: e.target.value } : r)),
                  );
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Measurement owner"
                value={row.measurement_owner}
                disabled={disabled}
                onChange={(e) => {
                  setSuccessRows((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { ...r, measurement_owner: e.target.value } : r,
                    ),
                  );
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
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
    </div>
  );
}
