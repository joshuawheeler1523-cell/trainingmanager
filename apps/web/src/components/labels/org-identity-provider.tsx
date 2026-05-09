"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LABELS, type LabelMap, type ToggleableModule } from "@arbor/shared";
import type { ModuleFlags, OrgIdentity } from "@/lib/labels/get-org-identity";
import type { Role } from "@/lib/auth/role";

const FALLBACK_IDENTITY: OrgIdentity = {
  presetKey: "hospital_training",
  labels: DEFAULT_LABELS,
  modules: {
    "module.classes": true,
    "module.training_planner": true,
    "module.education_requests": true,
  },
  role: null,
};

const OrgIdentityContext = createContext<OrgIdentity>(FALLBACK_IDENTITY);

export function OrgIdentityProvider({
  value,
  children,
}: {
  value: OrgIdentity | null;
  children: ReactNode;
}) {
  return (
    <OrgIdentityContext.Provider value={value ?? FALLBACK_IDENTITY}>
      {children}
    </OrgIdentityContext.Provider>
  );
}

/** Returns the resolved org labels + modules + role. Defaults to hospital training shape if unprovided. */
export function useOrgIdentity(): OrgIdentity {
  return useContext(OrgIdentityContext);
}

/** Convenience: returns just the labels map. */
export function useOrgLabels(): LabelMap {
  return useContext(OrgIdentityContext).labels;
}

/** Convenience: returns just the module flags. */
export function useOrgModules(): ModuleFlags {
  return useContext(OrgIdentityContext).modules;
}

/** Convenience: check a single module. */
export function useIsModuleEnabled(key: ToggleableModule): boolean {
  return useContext(OrgIdentityContext).modules[key];
}

/** Convenience: returns the caller's current role (or null if not a member). */
export function useCurrentRole(): Role | null {
  return useContext(OrgIdentityContext).role;
}
