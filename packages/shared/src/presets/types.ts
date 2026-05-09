import type { LabelOverrides } from "../labels/types";

/**
 * Workspace preset = bundle of module toggles + default labels + bucket
 * template + skill seed for an org. One preset is picked at org creation;
 * the manager can re-apply a different preset later (destructive action).
 *
 * Internal identifiers stay stable across all presets. Only display labels +
 * which modules are enabled change.
 */

export type PresetKey =
  | "hospital_training"
  | "corporate_ld"
  | "emr_analyst"
  | "clinical_informatics"
  | "software_engineering"
  | "consulting"
  | "creative_agency"
  | "custom";

/** Modules that can be toggled per workspace. Keys map to feature_flags rows. */
export type ToggleableModule =
  | "module.classes"
  | "module.training_planner"
  | "module.education_requests";

export const TOGGLEABLE_MODULES: ToggleableModule[] = [
  "module.classes",
  "module.training_planner",
  "module.education_requests",
];

export interface WorkspacePreset {
  key: PresetKey;
  /** Display name shown in the preset picker. */
  name: string;
  /** Short tagline shown under the name. */
  description: string;
  /** Module toggles. Modules not listed default to off; explicit `true` enables. */
  modules: Record<ToggleableModule, boolean>;
  /** Default label overrides. Empty object → use canonical defaults. */
  roleLabels: LabelOverrides;
  entityLabels: LabelOverrides;
  /**
   * Default bucket template name (matches a slate in allocations templates).
   * Applied during preset application as a one-shot seed; manager can edit
   * buckets freely afterward.
   */
  defaultBucketTemplate: string | null;
}
