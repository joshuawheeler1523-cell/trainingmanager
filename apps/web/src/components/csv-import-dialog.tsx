"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/20/solid";

export type ImportRowResult = {
  row: number; // 1-based row number in the source CSV (header is row 1)
  action: "created" | "updated" | "failed";
  message?: string;
};

export type ImportResult = {
  created: number;
  updated: number;
  failed: number;
  results: ImportRowResult[];
};

type ServerActionResult =
  | { ok: true; data: ImportResult }
  | { ok: false; error: { code: string; message: string } };

type Props = {
  /** Trigger button rendered by the caller. */
  trigger: React.ReactNode;
  /** Human-readable noun for messages, e.g. "instructors". */
  entity: string;
  /** Description shown above the file picker. */
  description: string;
  /** Column headers the user should put in their CSV (in order). */
  columns: { key: string; required: boolean; help?: string }[];
  /** Server action receiving the parsed rows. */
  serverAction: (rows: Record<string, string>[]) => Promise<ServerActionResult>;
};

/**
 * Minimal CSV parser — handles quoted fields, escaped quotes (""), CRLF/LF
 * line endings, and a UTF-8 BOM. Doesn't support multi-line cells.
 */
function parseCsv(text: string): string[][] {
  // Strip BOM
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped.charAt(i);
    if (inQuotes) {
      if (ch === '"' && stripped.charAt(i + 1) === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cur.push(field);
      field = "";
    } else if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else if (ch === "\r") {
      // skip — handled with following \n
    } else {
      field += ch;
    }
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Drop trailing fully-empty rows (e.g., file ends with a newline)
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last && last.every((c) => c.trim() === "")) {
      rows.pop();
    } else {
      break;
    }
  }
  return rows;
}

export default function CsvImportDialog({
  trigger,
  entity,
  description,
  columns,
  serverAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows(null);
    setHeaders([]);
    setParseError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const text = await file.text();
      const grid = parseCsv(text);
      if (grid.length < 2) {
        setParseError("CSV needs at least a header row and one data row.");
        return;
      }
      const hdr = grid[0]?.map((h) => h.trim()) ?? [];
      const required = columns.filter((c) => c.required).map((c) => c.key);
      const missing = required.filter((c) => !hdr.includes(c));
      if (missing.length > 0) {
        setParseError(`Missing required column(s): ${missing.join(", ")}`);
        return;
      }
      const parsedRows: Record<string, string>[] = grid.slice(1).map((r) => {
        const row: Record<string, string> = {};
        for (let i = 0; i < hdr.length; i++) {
          const key = hdr[i];
          if (key) row[key] = (r[i] ?? "").trim();
        }
        return row;
      });
      setHeaders(hdr);
      setRows(parsedRows);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to read file");
    }
  }

  function handleSubmit() {
    if (!rows) return;
    startTransition(async () => {
      const res = await serverAction(rows);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setResult(res.data);
      const summary = `${String(res.data.created)} created, ${String(res.data.updated)} updated${
        res.data.failed > 0 ? `, ${String(res.data.failed)} failed` : ""
      }`;
      if (res.data.failed === 0) {
        toast.success(`Imported ${entity}: ${summary}`);
      } else {
        toast.warning(`Imported ${entity} with errors: ${summary}`);
      }
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">
            Import {entity} from CSV
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-1 text-xs">
            {description}
          </Dialog.Description>

          {/* Column reference */}
          <details className="border-border mt-4 rounded-lg border">
            <summary className="text-foreground cursor-pointer px-3 py-2 text-xs font-medium">
              Required column headers ({columns.filter((c) => c.required).length} required ·{" "}
              {columns.filter((c) => !c.required).length} optional)
            </summary>
            <div className="border-border border-t px-3 py-2 text-xs">
              <table className="w-full">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 text-left font-medium">Column</th>
                    <th className="py-1 text-left font-medium">Required</th>
                    <th className="py-1 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.key} className="border-border border-t">
                      <td className="py-1 pr-2 font-mono">{c.key}</td>
                      <td className="py-1 pr-2">{c.required ? "yes" : "no"}</td>
                      <td className="text-muted-foreground py-1">{c.help ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {/* File picker */}
          {!result && (
            <div className="mt-4">
              <label className="border-border bg-surface flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
                <ArrowUpTrayIcon className="text-muted-foreground h-6 w-6" />
                <span className="text-foreground text-sm">
                  {rows ? `Loaded ${String(rows.length)} rows from CSV` : "Choose a CSV file"}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                <span className="text-primary text-xs font-medium underline">
                  {rows ? "Pick a different file" : "Browse"}
                </span>
              </label>
              {parseError && <p className="text-destructive mt-2 text-xs">{parseError}</p>}
            </div>
          )}

          {/* Preview */}
          {rows && !result && (
            <div className="border-border mt-4 overflow-hidden rounded-lg border">
              <p className="bg-surface text-muted-foreground px-3 py-2 text-xs font-medium">
                Preview (first 5 of {rows.length})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface border-border border-y">
                    <tr>
                      {headers.map((h) => (
                        <th
                          key={h}
                          className="text-muted-foreground whitespace-nowrap px-3 py-1.5 text-left font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-border border-t">
                        {headers.map((h) => (
                          <td
                            key={h}
                            className="text-foreground max-w-xs truncate px-3 py-1.5"
                            title={r[h]}
                          >
                            {r[h] || <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="mt-4 space-y-3">
              <div className="border-border bg-surface rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-foreground inline-flex items-center gap-1.5">
                    <CheckCircleIcon className="text-primary h-4 w-4" />
                    <strong className="tabular-nums">{result.created}</strong> created
                  </span>
                  <span className="text-foreground inline-flex items-center gap-1.5">
                    <ArrowPathIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />
                    <strong className="tabular-nums">{result.updated}</strong> updated
                  </span>
                  {result.failed > 0 && (
                    <span className="text-destructive inline-flex items-center gap-1.5">
                      <XCircleIcon className="h-4 w-4" />
                      <strong className="tabular-nums">{result.failed}</strong> failed
                    </span>
                  )}
                </div>
              </div>
              {result.results.some((r) => r.action === "failed") && (
                <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface text-muted-foreground sticky top-0">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Row</th>
                        <th className="px-3 py-1.5 text-left font-medium">Result</th>
                        <th className="px-3 py-1.5 text-left font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results
                        .filter((r) => r.action === "failed")
                        .map((r) => (
                          <tr key={r.row} className="border-border border-t">
                            <td className="text-muted-foreground px-3 py-1.5 tabular-nums">
                              {r.row}
                            </td>
                            <td className="text-destructive px-3 py-1.5">{r.action}</td>
                            <td className="text-foreground px-3 py-1.5">{r.message ?? ""}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            {result ? (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
                >
                  Import another
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
                  >
                    Done
                  </button>
                </Dialog.Close>
              </>
            ) : (
              <>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  disabled={!rows || pending}
                  onClick={handleSubmit}
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Importing…" : `Import ${rows ? String(rows.length) : ""} rows`}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
