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
import type { Role } from "@/lib/auth/role";

export type ModuleFlags = Record<ToggleableModule, boolean>;

export interface OrgIdentity {
  presetKey: PresetKey;
  labels: LabelMap;
  modules: ModuleFlags;
  /** Caller's role in this org. NULL if not a member (orphan / public path). */
  role: Role | null;
}

/**
 * Resolves the org's workspace identity in a single Supabase round-trip via
 * the org_identity(p_org_id) RPC. Returns:
 *   - organizations.preset_key + role_labels + entity_labels
 *   - the module.* feature flags as a jsonb object
 *   - the caller's role (user_role_in_org)
 *
 * Wrapped in React.cache so layout, page, and helpers share one fetch per
 * request. We deliberately don't use Next's unstable_cache here — its
 * out-of-request execution context conflicts with createClient()'s
 * cookies() read, which throws when called outside a request scope.
 */
export const getOrgIdentity = cache(async (orgId: string): Promise<OrgIdentity> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("org_identity", { p_org_id: orgId });
  const row = data?.[0];

  const presetKey = (row?.preset_key as PresetKey | undefined) ?? "hospital_training";
  const labels = resolveLabels({
    roleLabels: (row?.role_labels as LabelOverrides | null) ?? null,
    entityLabels: (row?.entity_labels as LabelOverrides | null) ?? null,
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
  const flagMap = (row?.module_flags ?? null) as Record<string, boolean> | null;
  if (flagMap) {
    for (const key of TOGGLEABLE_MODULES) {
      const val = flagMap[key];
      if (typeof val === "boolean") modules[key] = val;
    }
  }

  const role = (row?.user_role as Role | null | undefined) ?? null;
  return { presetKey, labels, modules, role };
});
