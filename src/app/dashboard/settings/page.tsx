"use client";

import { useOrg } from "@/lib/org-context";

export default function SettingsPage() {
  const { activeOrg } = useOrg();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>
      {activeOrg ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-lg">
          <p className="text-sm text-gray-500 mb-1">Organization</p>
          <p className="font-medium text-gray-900">{activeOrg.name}</p>
          <p className="text-sm text-gray-400 mt-1">/{activeOrg.slug}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No organization selected.</p>
      )}
    </div>
  );
}
