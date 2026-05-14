"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DEFAULT_LABELS,
  PRESET_LIST,
  PRESETS,
  type LabelKind,
  type LabelOverrides,
  type PresetKey,
  type ToggleableModule,
} from "@arbor/shared";
import {
  applyWorkspacePresetAction,
  setModuleFlagAction,
  updateLabelOverridesAction,
} from "./actions";

export type WorkspaceInitial = {
  presetKey: PresetKey;
  roleLabels: LabelOverrides;
  entityLabels: LabelOverrides;
  modules: Record<ToggleableModule, boolean>;
};

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const ROLE_KINDS: LabelKind[] = ["role.manager", "role.instructor", "role.viewer"];
const ENTITY_KINDS: LabelKind[] = ["entity.instructor"];

const MODULE_META: Record<ToggleableModule, { label: string; description: string }> = {
  "module.classes": {
    label: "Classes",
    description: "Class catalog with skill requirements + instructor assignments.",
  },
  "module.training_planner": {
    label: "Training Planner",
    description: "Implementation wizard: rooms, trainers, modules, and session schedules.",
  },
  "module.education_requests": {
    label: "Public Intake (Request Queue)",
    description: "Tokenized intake forms for non-staff to submit requests.",
  },
};

export default function WorkspaceSettingsView({ initial }: { initial: WorkspaceInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [presetKey, setPresetKey] = useState<PresetKey>(initial.presetKey);
  const [roleLabels, setRoleLabels] = useState<LabelOverrides>(initial.roleLabels);
  const [entityLabels, setEntityLabels] = useState<LabelOverrides>(initial.entityLabels);
  const [modules, setModules] = useState<Record<ToggleableModule, boolean>>(initial.modules);

  function handleApplyPreset(target: PresetKey, overwriteLabels: boolean) {
    startTransition(async () => {
      const result = await applyWorkspacePresetAction({ presetKey: target, overwriteLabels });
      if (result.ok) {
        toast.success(`Preset applied: ${target.replace("_", " ")}`);
        // Sync local state to the preset's manifest. router.refresh() re-runs
        // server components but useState retains its initial value across
        // re-renders, so without this the modules + label fields in this
        // form would still show the prior values until a hard reload.
        const preset = PRESETS[target];
        setPresetKey(target);
        setModules(preset.modules);
        if (overwriteLabels) {
          setRoleLabels(preset.roleLabels);
          setEntityLabels(preset.entityLabels);
        }
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleSaveLabels() {
    startTransition(async () => {
      const result = await updateLabelOverridesAction({ roleLabels, entityLabels });
      if (result.ok) {
        toast.success("Terminology saved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleToggleModule(moduleKey: ToggleableModule, enabled: boolean) {
    startTransition(async () => {
      const result = await setModuleFlagAction({ moduleKey, enabled });
      if (result.ok) {
        toast.success(`${MODULE_META[moduleKey].label}: ${enabled ? "enabled" : "disabled"}`);
        setModules((m) => ({ ...m, [moduleKey]: enabled }));
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function setLabelField(
    target: "role" | "entity",
    kind: LabelKind,
    field: "singular" | "plural",
    value: string,
  ) {
    const setter = target === "role" ? setRoleLabels : setEntityLabels;
    setter((prev) => {
      const existingEntry = prev[kind] ?? {};
      // Build entry without the cleared field. Empty string clears the
      // override → falls back to default at render time.
      const newEntry: { singular?: string; plural?: string } = {};
      if (field !== "singular" && existingEntry.singular !== undefined) {
        newEntry.singular = existingEntry.singular;
      }
      if (field !== "plural" && existingEntry.plural !== undefined) {
        newEntry.plural = existingEntry.plural;
      }
      if (value !== "") {
        newEntry[field] = value;
      }
      // Build outer map omitting this kind if entry is empty.
      const next: LabelOverrides = {};
      for (const k of Object.keys(prev) as (keyof LabelOverrides)[]) {
        if (k !== kind && prev[k]) next[k] = prev[k];
      }
      if (Object.keys(newEntry).length > 0) {
        next[kind] = newEntry;
      }
      return next;
    });
  }

  return (
    <div className="max-w-4xl space-y-10">
      {/* ── Preset picker ─────────────────────────────────────────────────── */}
      <section>
        <header className="mb-4">
          <h2 className="text-foreground text-lg font-semibold">Workspace preset</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Sets default modules + labels for the kind of team you run. Overrides below take
            precedence over the preset&apos;s defaults.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRESET_LIST.map((p) => {
            const active = p.key === presetKey;
            return (
              <button
                type="button"
                key={p.key}
                disabled={pending || active}
                onClick={() => {
                  // Re-applying the same preset is a no-op; switching is destructive
                  // for module flags (label overrides preserved by default).
                  if (active) return;
                  if (
                    !confirm(
                      `Switch to "${p.name}"?\n\nThis re-seeds module toggles and (optionally) terminology to the preset's defaults. Existing terminology overrides are kept unless you confirm otherwise.`,
                    )
                  ) {
                    return;
                  }
                  const overwrite = confirm(
                    `Also overwrite terminology overrides with "${p.name}" defaults?\n\nClick OK to overwrite. Cancel to keep your existing overrides.`,
                  );
                  handleApplyPreset(p.key, overwrite);
                }}
                className={
                  "rounded-lg border p-4 text-left text-sm transition-colors " +
                  (active
                    ? "border-primary bg-primary/5 cursor-default"
                    : "border-border hover:bg-surface")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground font-semibold">{p.name}</p>
                  {active && (
                    <span className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{p.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Terminology ───────────────────────────────────────────────────── */}
      <section>
        <header className="mb-4">
          <h2 className="text-foreground text-lg font-semibold">Terminology</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Override what we call roles and people. Empty fields fall back to the canonical default
            shown in light text.
          </p>
        </header>

        <div className="space-y-6">
          <LabelEditorGroup
            title="Roles"
            target="role"
            kinds={ROLE_KINDS}
            overrides={roleLabels}
            onChange={setLabelField}
          />
          <LabelEditorGroup
            title="Entities"
            target="entity"
            kinds={ENTITY_KINDS}
            overrides={entityLabels}
            onChange={setLabelField}
          />
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={pending}
            onClick={handleSaveLabels}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save terminology"}
          </button>
        </div>
      </section>

      {/* ── Module toggles ────────────────────────────────────────────────── */}
      <section>
        <header className="mb-4">
          <h2 className="text-foreground text-lg font-semibold">Modules</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Hide modules your team doesn&apos;t use. Data is preserved when a module is off —
            toggling back on restores access. Allocations, Projects, Work Intake, Reports, People,
            and Skills are always on.
          </p>
        </header>

        <div className="space-y-2">
          {(Object.keys(MODULE_META) as ToggleableModule[]).map((key) => {
            const meta = MODULE_META[key];
            const enabled = modules[key];
            return (
              <div
                key={key}
                className="border-border bg-background flex items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">{meta.label}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{meta.description}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={pending}
                    onChange={(e) => {
                      handleToggleModule(key, e.target.checked);
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-foreground text-sm font-medium">
                    {enabled ? "On" : "Off"}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function LabelEditorGroup({
  title,
  target,
  kinds,
  overrides,
  onChange,
}: {
  title: string;
  target: "role" | "entity";
  kinds: LabelKind[];
  overrides: LabelOverrides;
  onChange: (
    target: "role" | "entity",
    kind: LabelKind,
    field: "singular" | "plural",
    value: string,
  ) => void;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
        {title}
      </p>
      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-surface border-border border-b">
            <tr className="text-muted-foreground">
              <th className="px-3 py-2 text-left text-xs font-medium">Kind</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Singular</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Plural</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {kinds.map((kind) => {
              const def = DEFAULT_LABELS[kind];
              const ov = overrides[kind];
              return (
                <tr key={kind}>
                  <td className="text-muted-foreground px-3 py-2 font-mono text-xs">{kind}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={ov?.singular ?? ""}
                      placeholder={def.singular}
                      onBlur={(e) => {
                        onChange(target, kind, "singular", e.target.value);
                      }}
                      className={fieldClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={ov?.plural ?? ""}
                      placeholder={def.plural}
                      onBlur={(e) => {
                        onChange(target, kind, "plural", e.target.value);
                      }}
                      className={fieldClass}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
