"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrashIcon } from "@heroicons/react/20/solid";
import type { ReportMetadata, ReportSlug, SavedReport } from "@arbor/shared";
import EmptyState from "@/components/ui/empty-state";
import { deleteSavedReport } from "../actions";

type Props = {
  reports: SavedReport[];
  metadata: Record<ReportSlug, ReportMetadata>;
};

export default function SavedReportsView({ reports, metadata }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    if (!confirm("Delete this saved report? This can't be undone.")) return;
    startTransition(async () => {
      const result = await deleteSavedReport(id);
      if (result.ok) {
        toast.success("Saved report deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        title="No saved reports yet"
        description="Open a report, set filters, and click Save as Template to create one."
      />
    );
  }

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted-foreground text-xs">
          <tr>
            <Th className="w-1/3">Name</Th>
            <Th>Report</Th>
            <Th>Visibility</Th>
            <Th>Last run</Th>
            <Th>Created</Th>
            <Th className="w-12" />
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {reports.map((r) => (
            <tr key={r.id} className="hover:bg-surface/50">
              <td className="px-3 py-2">
                <Link
                  href={`/reports/${r.slug}?saved=${r.id}`}
                  className="text-primary font-medium hover:underline"
                >
                  {r.name}
                </Link>
                {r.description && (
                  <p className="text-muted-foreground line-clamp-1 text-xs">{r.description}</p>
                )}
              </td>
              <td className="text-muted-foreground px-3 py-2 text-xs">{metadata[r.slug].name}</td>
              <td className="text-muted-foreground px-3 py-2 text-xs">
                {r.org_visibility ? "Org" : "Private"}
              </td>
              <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                {r.last_run_at ? new Date(r.last_run_at).toLocaleDateString() : "—"}
              </td>
              <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                {new Date(r.created_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    handleDelete(r.id);
                  }}
                  aria-label="Delete saved report"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
