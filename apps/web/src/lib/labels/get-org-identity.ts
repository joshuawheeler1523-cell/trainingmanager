import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
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

const ORG_IDENTITY_TAG = (orgId: string) => `org-identity:${orgId}`;

/**
 * Public tag the workspace-settings actions can invalidate when org config
 * (preset, labels) or feature flags change.
 */
export const ORG_IDENTITY_GLOBAL_TAG = "org-identity";

/**
 * Resolves the org's workspace identity in a single Supabase round-trip via
 * the org_identity(p_org_id) RPC. The RPC returns:
 *   - organizations.preset_key + role_labels + entity_labels
 *   - the module.* feature flags as a jsonb object
 *   - the caller's role (user_role_in_org)
 *
 * Wrapped in unstable_cache(60s) — workspace config rarely changes, so most
 * page loads hit the cache and skip the RPC entirely. Actions that mutate
 * org config should call revalidateTag(ORG_IDENTITY_GLOBAL_TAG) to bust the
 * cache immediately. React.cache layered on top dedupes within a single
 * request (layout + page + helpers share one fetch).
 */
const getCachedIdentity = unstable_cache(
  async (orgId: string): Promise<OrgIdentity> => {
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
  },
  ["org-identity"],
  { revalidate: 60, tags: [ORG_IDENTITY_GLOBAL_TAG] },
);

export const getOrgIdentity = cache(async (orgId: string): Promise<OrgIdentity> => {
  return getCachedIdentity(orgId);
});

void ORG_IDENTITY_TAG; // reserved for per-org tag granularity if we adopt it later
