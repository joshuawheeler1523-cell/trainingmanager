"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { Tra, TraAudienceRole } from "@arbor/shared";
import { saveTraAudienceRoles, updateTra } from "../actions";
import {
  RemoveRowButton,
  RepeatableSection,
  SaveBar,
  TagInputField,
  TextAreaField,
} from "./form-helpers";

type AudienceRoleRow = { role: string; headcount: string };

type Props = {
  tra: Tra;
  audienceRoles: TraAudienceRole[];
  disabled: boolean;
};

export default function Step3Audience({ tra, audienceRoles, disabled }: Props) {
  const [pending, startTransition] = useTransition();

  const initialRoles = useMemo<AudienceRoleRow[]>(
    () =>
      [...audienceRoles]
        .sort((a, b) => a.position - b.position)
        .map((r) => ({
          role: r.role ?? "",
          headcount: r.headcount != null ? String(r.headcount) : "",
        })),
    [audienceRoles],
  );

  const [rolesRows, setRolesRows] = useState<AudienceRoleRow[]>(initialRoles);
  const [locations, setLocations] = useState<string[]>(tra.audience_locations);
  const [languages, setLanguages] = useState<string[]>(tra.audience_languages);
  const [prereq, setPrereq] = useState(tra.prerequisite_knowledge ?? "");
  const [techAccess, setTechAccess] = useState(tra.tech_access ?? "");
  const [accessibility, setAccessibility] = useState(tra.accessibility_needs ?? "");

  const dirty =
    JSON.stringify(rolesRows) !== JSON.stringify(initialRoles) ||
    JSON.stringify(locations) !== JSON.stringify(tra.audience_locations) ||
    JSON.stringify(languages) !== JSON.stringify(tra.audience_languages) ||
    prereq !== (tra.prerequisite_knowledge ?? "") ||
    techAccess !== (tra.tech_access ?? "") ||
    accessibility !== (tra.accessibility_needs ?? "");

  function handleSave() {
    startTransition(async () => {
      const [traUpdate, rolesSave] = await Promise.all([
        updateTra(tra.id, {
          audience_locations: locations,
          audience_languages: languages,
          prerequisite_knowledge: prereq || null,
          tech_access: techAccess || null,
          accessibility_needs: accessibility || null,
        }),
        saveTraAudienceRoles(
          tra.id,
          rolesRows.map((r, i) => ({
            position: i,
            role: r.role || null,
            headcount: r.headcount === "" ? null : Number(r.headcount),
          })),
        ),
      ]);
      if (!traUpdate.ok) {
        toast.error(traUpdate.error.message);
        return;
      }
      if (!rolesSave.ok) {
        toast.error(rolesSave.error.message);
        return;
      }
      toast.success("Saved");
    });
  }

  function handleDiscard() {
    setRolesRows(initialRoles);
    setLocations(tra.audience_locations);
    setLanguages(tra.audience_languages);
    setPrereq(tra.prerequisite_knowledge ?? "");
    setTechAccess(tra.tech_access ?? "");
    setAccessibility(tra.accessibility_needs ?? "");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">Who is this training for?</p>

      <RepeatableSection<AudienceRoleRow>
        label="Roles + headcount"
        rows={rolesRows}
        onChange={setRolesRows}
        disabled={disabled}
        addLabel="Add role"
        newRow={() => ({ role: "", headcount: "" })}
        renderRow={(row, update, remove) => (
          <div className="border-border bg-background flex items-center gap-2 rounded-md border p-2">
            <input
              type="text"
              placeholder="Role (e.g. ICU nurse)"
              value={row.role}
              disabled={disabled}
              onChange={(e) => {
                update({ ...row, role: e.target.value });
              }}
              className="border-input bg-background text-foreground flex-1 rounded-md border px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              placeholder="Headcount"
              value={row.headcount}
              disabled={disabled}
              min={0}
              onChange={(e) => {
                update({ ...row, headcount: e.target.value });
              }}
              className="border-input bg-background text-foreground w-32 rounded-md border px-2 py-1.5 text-sm"
            />
            <RemoveRowButton onClick={remove} disabled={disabled} />
          </div>
        )}
      />

      <TagInputField
        label="Locations / time zones"
        values={locations}
        onChange={setLocations}
        disabled={disabled}
        placeholder="e.g. Chicago, Mumbai (IST)"
      />

      <TagInputField
        label="Languages"
        values={languages}
        onChange={setLanguages}
        disabled={disabled}
        placeholder="e.g. English, Spanish"
      />

      <TextAreaField
        label="Prerequisite knowledge"
        value={prereq}
        onChange={setPrereq}
        disabled={disabled}
        rows={3}
      />

      <TextAreaField
        label="Tech access"
        value={techAccess}
        onChange={setTechAccess}
        disabled={disabled}
        rows={3}
        hint="Devices, network, LMS account"
      />

      <TextAreaField
        label="Known accessibility needs"
        value={accessibility}
        onChange={setAccessibility}
        disabled={disabled}
        rows={3}
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
