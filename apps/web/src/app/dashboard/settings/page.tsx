import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";

export default async function SettingsPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);

  const org = orgId
    ? (await supabase.from("organizations").select("name, slug").eq("id", orgId).single()).data
    : null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Settings</h1>
      {org ? (
        <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6">
          <p className="mb-1 text-sm text-gray-500">Organization</p>
          <p className="font-medium text-gray-900">{org.name}</p>
          <p className="mt-1 text-sm text-gray-400">/{org.slug}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No organization selected.</p>
      )}
    </div>
  );
}
