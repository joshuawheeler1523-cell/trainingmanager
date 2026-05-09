import { DEFAULT_LABELS } from "./defaults";
import type { LabelKind, LabelMap, LabelOverrides, LabelValue } from "./types";

/**
 * Merges per-org label overrides over canonical defaults. Any partial override
 * (just singular, or just plural) falls back to the default for the missing
 * field. Unknown override keys are silently ignored — they can't break the
 * resolved map.
 */
export function resolveLabels(overrides: {
  roleLabels?: LabelOverrides | null;
  entityLabels?: LabelOverrides | null;
}): LabelMap {
  const merged: LabelMap = { ...DEFAULT_LABELS };
  const all: LabelOverrides = {
    ...(overrides.roleLabels ?? {}),
    ...(overrides.entityLabels ?? {}),
  };

  for (const key of Object.keys(merged) as LabelKind[]) {
    const override = all[key];
    if (!override) continue;
    const merged_value: LabelValue = {
      singular: override.singular ?? merged[key].singular,
      plural: override.plural ?? merged[key].plural,
    };
    merged[key] = merged_value;
  }

  return merged;
}
