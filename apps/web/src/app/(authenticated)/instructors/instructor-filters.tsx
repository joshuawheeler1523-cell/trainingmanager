"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import InstructorFormDialog from "./instructor-form-dialog";

type Props = {
  departments: string[];
};

export default function InstructorFilters({ departments }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const push = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(sp.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, sp],
  );

  const search = sp.get("search") ?? "";
  const department = sp.get("department") ?? "";
  const showDeleted = sp.get("deleted") === "1";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            push("search", e.target.value);
          }}
          placeholder="Search by name or email…"
          className="border-input bg-background text-foreground focus:ring-ring w-64 rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2"
        />
      </div>

      {/* Department */}
      {departments.length > 0 && (
        <select
          value={department}
          onChange={(e) => {
            push("department", e.target.value);
          }}
          className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}

      {/* Utilization filter - available after Phase 3 */}
      <button
        type="button"
        disabled
        title="Utilization filter available after workload sources are configured (Phase 3)"
        className="border-border text-muted-foreground cursor-not-allowed rounded-md border px-3 py-1.5 text-sm opacity-50"
      >
        Utilization status
      </button>

      {/* Show deleted toggle */}
      <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showDeleted}
          onChange={(e) => {
            push("deleted", e.target.checked ? "1" : "");
          }}
          className="border-border h-4 w-4 rounded"
        />
        Show archived
      </label>

      {/* Add instructor button */}
      <div className="ml-auto">
        <InstructorFormDialog
          mode="create"
          trigger={
            <button
              type="button"
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Add instructor
            </button>
          }
        />
      </div>
    </div>
  );
}
