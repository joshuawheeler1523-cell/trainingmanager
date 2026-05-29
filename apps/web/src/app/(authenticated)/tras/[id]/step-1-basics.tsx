"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  TRA_NEEDED_BY_DRIVER_VALUES,
  type Tra,
  type TraNeededByDriver,
  type TraStakeholder,
} from "@arbor/shared";
import { saveTraStakeholders, updateTra } from "../actions";
import {
  RemoveRowButton,
  RepeatableSection,
  SaveBar,
  SelectField,
  TextField,
} from "./form-helpers";

type StakeholderRow = {
  name: string;
  role: string;
  decision_rights: string;
  email: string;
};

type Props = {
  tra: Tra;
  stakeholders: TraStakeholder[];
  disabled: boolean;
};

export default function Step1Basics({ tra, stakeholders, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  const [projectName, setProjectName] = useState(tra.project_name);
  const [requestorName, setRequestorName] = useState(tra.requestor_name ?? "");
  const [requestorRole, setRequestorRole] = useState(tra.requestor_role ?? "");
  const [requestorDepartment, setRequestorDepartment] = useState(tra.requestor_department ?? "");
  const [requestingDepartment, setRequestingDepartment] = useState(tra.requesting_department ?? "");
  const [executiveSponsor, setExecutiveSponsor] = useState(tra.executive_sponsor ?? "");
  const [neededByDate, setNeededByDate] = useState(tra.needed_by_date ?? "");
  const [neededByDriver, setNeededByDriver] = useState<TraNeededByDriver | "">(
    tra.needed_by_driver ?? "",
  );

  const initialStakeholderRows = useMemo<StakeholderRow[]>(
    () =>
      [...stakeholders]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          name: s.name ?? "",
          role: s.role ?? "",
          decision_rights: s.decision_rights ?? "",
          email: s.email ?? "",
        })),
    [stakeholders],
  );
  const [stakeholderRows, setStakeholderRows] = useState<StakeholderRow[]>(initialStakeholderRows);

  const dirty =
    projectName !== tra.project_name ||
    requestorName !== (tra.requestor_name ?? "") ||
    requestorRole !== (tra.requestor_role ?? "") ||
    requestorDepartment !== (tra.requestor_department ?? "") ||
    requestingDepartment !== (tra.requesting_department ?? "") ||
    executiveSponsor !== (tra.executive_sponsor ?? "") ||
    neededByDate !== (tra.needed_by_date ?? "") ||
    neededByDriver !== (tra.needed_by_driver ?? "") ||
    JSON.stringify(stakeholderRows) !== JSON.stringify(initialStakeholderRows);

  function handleSave() {
    startTransition(async () => {
      // The tra row and tra_stakeholders rows are independent — fire both
      // saves in parallel so the wizard "Save" doesn't queue two round-trips.
      const [traUpdate, stakeholderSave] = await Promise.all([
        updateTra(tra.id, {
          project_name: projectName,
          requestor_name: requestorName || null,
          requestor_role: requestorRole || null,
          requestor_department: requestorDepartment || null,
          requesting_department: requestingDepartment || null,
          executive_sponsor: executiveSponsor || null,
          needed_by_date: neededByDate || null,
          needed_by_driver: neededByDriver || null,
        }),
        saveTraStakeholders(
          tra.id,
          stakeholderRows.map((r, i) => ({
            position: i,
            name: r.name || null,
            role: r.role || null,
            decision_rights: r.decision_rights || null,
            email: r.email || null,
          })),
        ),
      ]);
      if (!traUpdate.ok) {
        toast.error(traUpdate.error.message);
        return;
      }
      if (!stakeholderSave.ok) {
        toast.error(stakeholderSave.error.message);
        return;
      }
      toast.success("Saved");
    });
  }

  function handleDiscard() {
    setProjectName(tra.project_name);
    setRequestorName(tra.requestor_name ?? "");
    setRequestorRole(tra.requestor_role ?? "");
    setRequestorDepartment(tra.requestor_department ?? "");
    setRequestingDepartment(tra.requesting_department ?? "");
    setExecutiveSponsor(tra.executive_sponsor ?? "");
    setNeededByDate(tra.needed_by_date ?? "");
    setNeededByDriver(tra.needed_by_driver ?? "");
    setStakeholderRows(initialStakeholderRows);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-muted-foreground text-sm">Who&apos;s asking, and when do they need it?</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Project name"
          value={projectName}
          onChange={setProjectName}
          disabled={disabled}
          required
        />
        <TextField
          label="Requesting department (project)"
          value={requestingDepartment}
          onChange={setRequestingDepartment}
          disabled={disabled}
          hint="The department this training serves"
        />
        <TextField
          label="Your name"
          value={requestorName}
          onChange={setRequestorName}
          disabled={disabled}
        />
        <TextField
          label="Your role"
          value={requestorRole}
          onChange={setRequestorRole}
          disabled={disabled}
        />
        <TextField
          label="Your department"
          value={requestorDepartment}
          onChange={setRequestorDepartment}
          disabled={disabled}
        />
        <TextField
          label="Executive sponsor"
          value={executiveSponsor}
          onChange={setExecutiveSponsor}
          disabled={disabled}
        />
        <TextField
          label="Needed-by date"
          value={neededByDate}
          onChange={setNeededByDate}
          type="date"
          disabled={disabled}
        />
        <SelectField
          label="Needed-by driver"
          value={neededByDriver}
          onChange={setNeededByDriver}
          disabled={disabled}
          options={TRA_NEEDED_BY_DRIVER_VALUES.map((v) => ({
            value: v,
            label: v.charAt(0).toUpperCase() + v.slice(1),
          }))}
          hint="Why this date in particular?"
        />
      </div>

      <RepeatableSection<StakeholderRow>
        label="Key stakeholders"
        rows={stakeholderRows}
        onChange={setStakeholderRows}
        disabled={disabled}
        addLabel="Add stakeholder"
        newRow={() => ({ name: "", role: "", decision_rights: "", email: "" })}
        renderRow={(row, update, remove) => (
          <div className="border-border bg-background flex items-start gap-2 rounded-md border p-2">
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Name"
                value={row.name}
                disabled={disabled}
                onChange={(e) => {
                  update({ ...row, name: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Role"
                value={row.role}
                disabled={disabled}
                onChange={(e) => {
                  update({ ...row, role: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="email"
                placeholder="Email"
                value={row.email}
                disabled={disabled}
                onChange={(e) => {
                  update({ ...row, email: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Decision rights (e.g. approver, advisor, informed)"
                value={row.decision_rights}
                disabled={disabled}
                onChange={(e) => {
                  update({ ...row, decision_rights: e.target.value });
                }}
                className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
            <RemoveRowButton onClick={remove} disabled={disabled} />
          </div>
        )}
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
