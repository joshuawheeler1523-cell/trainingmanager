import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import SettingsForm, { type SettingsInitial } from "./settings-form";

export default async function AdminSettingsPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Settings" description="Organization profile + feature flags." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [{ data: org }, { data: flags }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, time_zone, logo_url, settings")
      .eq("id", orgId)
      .maybeSingle(),
    supabase.from("feature_flags").select("key, enabled").eq("org_id", orgId),
  ]);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const initial: SettingsInitial = {
    name: org?.name ?? "",
    time_zone: org?.time_zone ?? "America/New_York",
    logo_url: org?.logo_url ?? "",
    brand_color: (settings["brand_color"] as string | undefined) ?? "",
    default_working_hours_per_week:
      (settings["default_working_hours_per_week"] as number | undefined) ?? 40,
    cert_expiry_warning_days: (settings["cert_expiry_warning_days"] as number | undefined) ?? 30,
    request_aging_days: (settings["request_aging_days"] as number | undefined) ?? 5,
    flags: Object.fromEntries((flags ?? []).map((f) => [f.key, f.enabled])),
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organization profile, notifications, and feature flags."
      />
      <div className="p-6">
        <SettingsForm initial={initial} />
      </div>
    </div>
  );
}
