"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from "@heroicons/react/20/solid";
import * as XLSX from "xlsx";
import {
  TASK_EXPORT_COLUMNS,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  diffTaskImport,
  type ImportDiff,
  type ImportRow,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@arbor/shared";
import { commitTaskImport } from "../actions";

type Props = {
  project: Project;
  tasks: Task[];
};

type SheetRow = Record<string, string | number | boolean | null | undefined>;

export default function ImportExportControls({ project, tasks }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  function handleFile(file: File) {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!(data instanceof ArrayBuffer)) {
          throw new Error("Could not read file");
        }
        const wb = XLSX.read(new Uint8Array(data), { type: "array" });
        const firstName = wb.SheetNames[0];
        if (!firstName) throw new Error("Workbook has no sheets");
        const sheet = wb.Sheets[firstName];
        if (!sheet) throw new Error(`Sheet "${firstName}" not found`);

        const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
        const parsed: ImportRow[] = [];
        for (const [i, row] of rows.entries()) {
          const name = String(row["Name"] ?? "").trim();
          if (!name) {
            // skip blank rows entirely (Excel sometimes leaves trailing empty rows)
            continue;
          }
          const status = String(row["Status"] ?? "not_started") as TaskStatus;
          const priority = String(row["Priority"] ?? "medium") as TaskPriority;
          if (!TASK_STATUS_VALUES.includes(status)) {
            throw new Error(`Row ${(i + 2).toString()}: unknown status "${status}"`);
          }
          if (!TASK_PRIORITY_VALUES.includes(priority)) {
            throw new Error(`Row ${(i + 2).toString()}: unknown priority "${priority}"`);
          }
          const idCell = String(row["ID"] ?? "").trim();
          const startCell = String(row["Start"] ?? "").trim();
          const endCell = String(row["End"] ?? "").trim();
          const estCell = String(row["Estimated Hours"] ?? "").trim();
          const pctCell = String(row["% Complete"] ?? "0").trim();
          parsed.push({
            id: idCell || null,
            name,
            description: String(row["Description"] ?? "").trim() || null,
            status,
            priority,
            start_date: startCell ? normalizeDate(startCell) : null,
            end_date: endCell ? normalizeDate(endCell) : null,
            estimated_hours: estCell === "" ? null : Number(estCell),
            percent_complete: clampPercent(Number(pctCell || 0)),
          });
        }

        const d = diffTaskImport({ currentTasks: tasks, importedRows: parsed });
        setDiff(d);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to parse file";
        setParseError(msg);
        setDiff(null);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleCommit() {
    if (!diff) return;
    startTransition(async () => {
      const result = await commitTaskImport(project.id, {
        inserts: diff.inserts,
        updates: diff.updates.map((u) => ({ id: u.id, row: u.next })),
        deleteIds: diff.deletes.map((d) => d.id),
      });
      if (result.ok) {
        const r = result.data;
        toast.success(
          `Imported ${r.inserted.toString()} added, ${r.updated.toString()} updated, ${r.deleted.toString()} removed`,
        );
        setDiff(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="border-border bg-background space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-foreground text-sm font-semibold">Excel round-trip</p>
          <p className="text-muted-foreground text-xs">
            Export tasks to XLSX, edit in Excel, then re-upload. The preview shows what will change
            before anything commits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/projects/${project.id}/tasks.xlsx`}
            className="border-input bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export tasks
          </a>
          <label className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Import tasks
            <input
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {parseError && (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs">
          {parseError}
        </p>
      )}

      {diff && (
        <DiffPreview
          diff={diff}
          pending={pending}
          onCommit={handleCommit}
          onCancel={() => {
            setDiff(null);
          }}
        />
      )}

      <p className="text-muted-foreground text-xs">
        Headers expected:{" "}
        <code className="bg-surface rounded px-1 font-mono text-[11px]">
          {TASK_EXPORT_COLUMNS.join(", ")}
        </code>
      </p>
    </div>
  );
}

function DiffPreview({
  diff,
  pending,
  onCommit,
  onCancel,
}: {
  diff: ImportDiff;
  pending: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const total = diff.inserts.length + diff.updates.length + diff.deletes.length;
  return (
    <div className="border-border bg-surface space-y-3 rounded-md border p-3">
      <p className="text-foreground text-sm font-semibold">
        Preview · {diff.inserts.length.toString()} added · {diff.updates.length.toString()} updated
        · {diff.deletes.length.toString()} removed
      </p>

      {total === 0 ? (
        <p className="text-muted-foreground text-xs">
          The file matches the current state — nothing to apply.
        </p>
      ) : (
        <>
          {diff.inserts.length > 0 && (
            <details open>
              <summary className="text-foreground cursor-pointer text-xs font-medium">
                Added ({diff.inserts.length.toString()})
              </summary>
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {diff.inserts.slice(0, 20).map((r, i) => (
                  <li key={i} className="text-emerald-700 dark:text-emerald-400">
                    + {r.name}
                  </li>
                ))}
                {diff.inserts.length > 20 && (
                  <li className="italic">…{(diff.inserts.length - 20).toString()} more</li>
                )}
              </ul>
            </details>
          )}

          {diff.updates.length > 0 && (
            <details open>
              <summary className="text-foreground cursor-pointer text-xs font-medium">
                Updated ({diff.updates.length.toString()})
              </summary>
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {diff.updates.slice(0, 20).map((u) => (
                  <li key={u.id} className="text-amber-700 dark:text-amber-400">
                    ~ {u.next.name}{" "}
                    <span className="text-muted-foreground">[{u.changedFields.join(", ")}]</span>
                  </li>
                ))}
                {diff.updates.length > 20 && (
                  <li className="italic">…{(diff.updates.length - 20).toString()} more</li>
                )}
              </ul>
            </details>
          )}

          {diff.deletes.length > 0 && (
            <details open>
              <summary className="text-foreground cursor-pointer text-xs font-medium">
                Removed ({diff.deletes.length.toString()})
              </summary>
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {diff.deletes.slice(0, 20).map((d) => (
                  <li key={d.id} className="text-destructive">
                    − {d.current.name}
                  </li>
                ))}
                {diff.deletes.length > 20 && (
                  <li className="italic">…{(diff.deletes.length - 20).toString()} more</li>
                )}
              </ul>
            </details>
          )}
        </>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || total === 0}
          onClick={onCommit}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Importing…" : `Apply ${total.toString()} changes`}
        </button>
      </div>
    </div>
  );
}

// Excel sometimes returns dates as serial numbers; SheetJS gives us strings
// when the cell is formatted as text. Normalize to ISO yyyy-mm-dd.
function normalizeDate(s: string): string {
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s; // give up — server will reject
  return d.toISOString().slice(0, 10);
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
