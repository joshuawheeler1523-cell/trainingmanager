"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownTrayIcon,
  BookmarkIcon,
  DocumentArrowDownIcon,
  TableCellsIcon,
} from "@heroicons/react/20/solid";
import {
  REPORT_METADATA,
  type ReportDataset,
  type ReportSlug,
  type SavedReport,
} from "@arbor/shared";
import ReportPreview from "@/components/reports/report-preview";
import { saveReport } from "../actions";
import FilterPane from "./filter-pane";

type Bucket = { id: string; name: string };
type Instructor = { id: string; full_name: string };

type Props = {
  slug: ReportSlug;
  buckets: Bucket[];
  instructors: Instructor[];
  initial: SavedReport | null;
};

export default function ReportRunner({ slug, buckets, instructors, initial }: Props) {
  const router = useRouter();
  const meta = REPORT_METADATA[slug];

  const [filters, setFilters] = useState<Record<string, unknown>>(initial?.filters ?? {});
  const [dataset, setDataset] = useState<ReportDataset | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [exportPending, startExport] = useTransition();

  // Debounce preview fetch so typing into a filter input doesn't hit the
  // server on every keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runPreview(filters);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function runPreview(f: Record<string, unknown>) {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(
        `/api/reports/${slug}/preview?` +
          new URLSearchParams({ filters: JSON.stringify(f) }).toString(),
        { cache: "no-store" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Preview failed: ${res.status.toString()}`);
      }
      const body = (await res.json()) as ReportDataset;
      setDataset(body);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
      setDataset(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleSave() {
    const name = prompt("Save as template — give it a name:", initial?.name ?? meta.name);
    if (!name?.trim()) return;
    startSave(async () => {
      const result = await saveReport({
        slug,
        name: name.trim(),
        filters,
        org_visibility: false,
      });
      if (result.ok) {
        toast.success("Template saved");
        router.push(`/reports/${slug}?saved=${result.data.id}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleExport(format: "pdf" | "xlsx" | "csv") {
    startExport(() => {
      const url =
        `/api/reports/${slug}/export?` +
        new URLSearchParams({
          format,
          filters: JSON.stringify(filters),
          ...(initial?.id ? { saved: initial.id } : {}),
        }).toString();
      // Trigger a download by navigating to the URL in a hidden anchor.
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  const exportButtons = [
    { fmt: "pdf" as const, label: "PDF", Icon: DocumentArrowDownIcon },
    { fmt: "xlsx" as const, label: "Excel", Icon: TableCellsIcon },
    { fmt: "csv" as const, label: "CSV", Icon: ArrowDownTrayIcon },
  ].map(({ fmt, label, Icon }) => (
    <button
      key={fmt}
      type="button"
      disabled={!dataset || exportPending}
      onClick={() => {
        handleExport(fmt);
      }}
      className="border-input bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  ));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside>
          <FilterPane
            slug={slug}
            buckets={buckets}
            instructors={instructors}
            value={filters}
            onChange={setFilters}
          />
        </aside>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {previewLoading
                ? "Refreshing preview…"
                : previewError
                  ? `Preview error: ${previewError}`
                  : "Preview reflects the current filters."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {exportButtons}
              <button
                type="button"
                disabled={savePending}
                onClick={handleSave}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                <BookmarkIcon className="h-3.5 w-3.5" />
                {initial ? "Save as new" : "Save as template"}
              </button>
            </div>
          </div>

          {dataset ? (
            <ReportPreview dataset={dataset} />
          ) : (
            <div className="border-border bg-surface rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground text-sm">{previewError ?? "Loading preview…"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
