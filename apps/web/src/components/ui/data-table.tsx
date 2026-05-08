"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";

type Props<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  pageSize?: number;
  searchPlaceholder?: string;
  globalFilterKey?: string;
  className?: string;
};

export default function DataTable<T>({
  data,
  columns,
  pageSize = 25,
  searchPlaceholder = "Search…",
  className,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const { pageIndex, pageSize: size } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const from = total === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min((pageIndex + 1) * size, total);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="search"
          aria-label={searchPlaceholder}
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
          }}
          placeholder={searchPlaceholder}
          className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring h-8 w-60 rounded-md border px-3 text-sm focus:outline-none focus:ring-2"
        />
      </div>

      {/* Table */}
      <div className="border-border bg-background overflow-hidden rounded-lg border">
        <table className="divide-border min-w-full divide-y text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-surface">
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "text-muted-foreground px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider",
                        canSort && "hover:text-foreground cursor-pointer select-none",
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                      colSpan={header.colSpan}
                    >
                      <span className="inline-flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="text-muted-foreground">
                            {sorted === "asc" ? (
                              <ChevronUpIcon className="h-3 w-3" />
                            ) : sorted === "desc" ? (
                              <ChevronDownIcon className="h-3 w-3" />
                            ) : (
                              <ChevronUpDownIcon className="h-3 w-3 opacity-40" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-border divide-y">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-muted-foreground px-4 py-10 text-center text-sm"
                >
                  No results.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="text-foreground px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > size && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={!table.getCanPreviousPage()}
              onClick={() => {
                table.previousPage();
              }}
              className="border-border hover:bg-surface rounded border px-2 py-1 text-xs disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              disabled={!table.getCanNextPage()}
              onClick={() => {
                table.nextPage();
              }}
              className="border-border hover:bg-surface rounded border px-2 py-1 text-xs disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
