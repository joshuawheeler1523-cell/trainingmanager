import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { TOGGLEABLE_MODULES, type LabelOverrides } from "@arbor/shared";
import WorkspaceSettingsView, { type WorkspaceInitial } from "./workspace-settings-view";

export default async function WorkspaceSettingsPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Workspace identity"
          description="Preset, terminology, and module toggles for this organization."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [{ data: org }, { data: flags }] = await Promise.all([
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
  ]);

  const moduleFlags: Record<string, boolean> = {
    "module.classes": true,
    "module.training_planner": true,
    "module.education_requests": true,
  };
  for (const f of flags ?? []) {
    moduleFlags[f.key] = f.enabled;
  }

  const initial: WorkspaceInitial = {
    presetKey: org?.preset_key ?? "hospital_training",
    roleLabels: (org?.role_labels as LabelOverrides | null) ?? {},
    entityLabels: (org?.entity_labels as LabelOverrides | null) ?? {},
    modules: {
      "module.classes": moduleFlags["module.classes"] ?? true,
      "module.training_planner": moduleFlags["module.training_planner"] ?? true,
      "module.education_requests": moduleFlags["module.education_requests"] ?? true,
    },
  };

  return (
    <div>
      <PageHeader
        title="Workspace identity"
        description="Pick a preset, override terminology, or toggle modules. Affects every member of the organization."
      />
      <div className="p-6">
        <WorkspaceSettingsView initial={initial} />
      </div>
    </div>
  );
}
