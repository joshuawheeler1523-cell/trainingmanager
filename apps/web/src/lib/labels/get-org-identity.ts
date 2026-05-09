import "server-only";
import { cache } from "react";
import {
  resolveLabels,
  type LabelMap,
  type LabelOverrides,
  type PresetKey,
  type ToggleableModule,
  TOGGLEABLE_MODULES,
} from "@arbor/shared";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, type Role } from "@/lib/auth/role";

export type ModuleFlags = Record<ToggleableModule, boolean>;

export interface OrgIdentity {
  presetKey: PresetKey;
  labels: LabelMap;
  modules: ModuleFlags;
  /** Caller's role in this org. NULL if not a member (orphan / public path). */
  role: Role | null;
}

/**
 * Resolves the org's workspace identity in one round-trip pair:
 *   • organizations.preset_key + role_labels + entity_labels
 *   • feature_flags rows for each module.* key
 *   • current caller's role in the org
 *
 * Cached per-request via React.cache so layout, page, and helpers share the
 * same fetch. Returns sensible defaults if the row is missing (orphan org_id).
 */
export const getOrgIdentity = cache(async (orgId: string): Promise<OrgIdentity> => {
  const supabase = await createClient();

  const [{ data: org }, { data: flags }, role] = await Promise.all([
    supabase
      .from("organizations")
      .select("preset_key, role_labels, entity_labels")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("feature_flags")
      .select("key, enabled")
      .eq("org_id", orgId)
      .in("key", TOGGLEABLE_MODULES),
    getCurrentRole(orgId),
  ]);

  const presetKey = org?.preset_key ?? "hospital_training";
  const labels = resolveLabels({
    roleLabels: (org?.role_labels as LabelOverrides | null) ?? null,
    entityLabels: (org?.entity_labels as LabelOverrides | null) ?? null,
  });

  // Default every module ON if no row exists for it. Hospital training default
  // = everything enabled. A non-training preset would have explicit `false`
  // rows already seeded by apply_workspace_preset, so missing rows mean
  // "never configured, behave like hospital training."
  const modules: ModuleFlags = {
    "module.classes": true,
    "module.training_planner": true,
    "module.education_requests": true,
  };
  for (const flag of flags ?? []) {
    if (TOGGLEABLE_MODULES.includes(flag.key as ToggleableModule)) {
      modules[flag.key as ToggleableModule] = flag.enabled;
    }
  }

  return { presetKey, labels, modules, role };
});
