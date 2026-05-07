"use client";

import { useOrg } from "@/lib/org-context";

export default function SettingsPage() {
  const { activeOrg } = useOrg();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Settings</h1>
      {activeOrg ? (
        <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6">
          <p className="mb-1 text-sm text-gray-500">Organization</p>
          <p className="font-medium text-gray-900">{activeOrg.name}</p>
          <p className="mt-1 text-sm text-gray-400">/{activeOrg.slug}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No organization selected.</p>
      )}
    </div>
  );
}
