import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import StartExportButton from "./start-export-button";

export default async function DataExportPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;
  if (!(await isManager(orgId))) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">Manager access required.</p>
      </div>
    );
  }

  const { data: exports } = await supabase
    .from("data_exports")
    .select(
      "id, requested_at, completed_at, status, size_bytes, table_count, row_count, storage_path, error_message",
    )
    .eq("org_id", orgId)
    .order("requested_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Link href="/admin" className="text-muted-foreground hover:text-foreground text-xs">
          ← Back to admin
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">Data export</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Download a complete copy of your organization&apos;s data as a ZIP of JSONL files. Use
          this to satisfy GDPR / HIPAA subject access requests, run your own analytics, or keep an
          off-platform backup. Each export is available for 7 days via a signed link.
        </p>
      </div>

      <section className="border-border bg-background space-y-3 rounded-xl border p-5">
        <h2 className="text-foreground text-base font-bold">Generate new export</h2>
        <p className="text-muted-foreground text-xs">
          Generation typically takes a few seconds. Larger orgs may take up to a minute.
        </p>
        <StartExportButton />
      </section>

      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-foreground text-base font-bold">Export history</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">Requested</th>
              <th className="px-5 py-2.5 text-left font-medium">Status</th>
              <th className="px-5 py-2.5 text-right font-medium">Tables</th>
              <th className="px-5 py-2.5 text-right font-medium">Rows</th>
              <th className="px-5 py-2.5 text-right font-medium">Size</th>
              <th className="px-5 py-2.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {(exports ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground p-6 text-center text-sm italic">
                  No exports yet.
                </td>
              </tr>
            ) : (
              (exports ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="text-foreground px-5 py-3 tabular-nums">
                    {e.requested_at.replace("T", " ").slice(0, 16)}
                  </td>
                  <td className="text-foreground px-5 py-3 capitalize">{e.status}</td>
                  <td className="text-foreground px-5 py-3 text-right tabular-nums">
                    {e.table_count?.toString() ?? "—"}
                  </td>
                  <td className="text-foreground px-5 py-3 text-right tabular-nums">
                    {e.row_count?.toString() ?? "—"}
                  </td>
                  <td className="text-foreground px-5 py-3 text-right tabular-nums">
                    {e.size_bytes ? formatBytes(e.size_bytes) : "—"}
                  </td>
                  <td className="text-foreground px-5 py-3 text-right">
                    {e.status === "completed" && e.storage_path ? (
                      <a
                        href={`/api/admin/data-exports/${e.id}/download`}
                        className="text-primary hover:underline"
                      >
                        Download
                      </a>
                    ) : e.status === "failed" ? (
                      <span className="text-destructive text-xs" title={e.error_message ?? ""}>
                        Failed
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">…</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toString()} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
