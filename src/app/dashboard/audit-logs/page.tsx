"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/org-context";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

type AuditLog = Tables<"audit_logs">;

export default function AuditLogsPage() {
  const { activeOrg } = useOrg();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrg) return;

    const supabase = createClient();
    setLoading(true);

    supabase
      .from("audit_logs")
      .select("*")
      .eq("org_id", activeOrg.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setLogs(data ?? []);
        setLoading(false);
      });
  }, [activeOrg]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Audit Logs</h1>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-500">No audit log entries yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Resource</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{log.action}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {log.resource_type ? `${log.resource_type}${log.resource_id ? ` / ${log.resource_id}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {log.actor_id ? log.actor_id.slice(0, 8) + "…" : "system"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
