"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/20/solid";
import InstructorFormDialog from "./instructor-form-dialog";
import BulkAnnualHoursDialog from "./bulk-annual-hours-dialog";
import CsvImportDialog from "@/components/csv-import-dialog";
import { Label } from "@/components/labels";
import { ManagerOnly } from "@/components/auth/role-gate";
import { importInstructorsCsv } from "./actions";

type Props = {
  departments: string[];
  activeInstructorCount: number;
};

export default function InstructorFilters({ departments, activeInstructorCount }: Props) {
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
  const utilization = sp.get("utilization") ?? "";
  const showDeleted = sp.get("deleted") === "1";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          type="search"
          aria-label="Search instructors by name or email"
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

      {/* Utilization status filter */}
      <select
        value={utilization}
        onChange={(e) => {
          push("utilization", e.target.value);
        }}
        className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
        aria-label="Utilization status"
      >
        <option value="">All utilizations</option>
        <option value="under_utilized">Under-utilized (&lt; 40%)</option>
        <option value="balanced">Balanced (40–79%)</option>
        <option value="at_risk">At risk (80–94%)</option>
        <option value="over_allocated">Over-allocated (95%+)</option>
      </select>

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

      {/* Add / import instructors */}
      <div className="ml-auto flex items-center gap-2">
        {activeInstructorCount > 0 && (
          <BulkAnnualHoursDialog
            instructorCount={activeInstructorCount}
            trigger={
              <button
                type="button"
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
                title="Set annual hours on every active instructor"
              >
                <AdjustmentsHorizontalIcon className="h-4 w-4" />
                Set annual hours…
              </button>
            }
          />
        )}
        <CsvImportDialog
          entity="instructors"
          description="Upsert instructors by email (case-insensitive). Rows with no email always insert. Existing instructors with a matching email will be updated."
          columns={[
            { key: "full_name", required: true, help: "Display name; max 200 chars" },
            { key: "email", required: false, help: "Match key; valid email or blank" },
            { key: "phone", required: false },
            { key: "department", required: false, help: "Free-text label, e.g. Cardiology" },
            { key: "location", required: false },
            { key: "job_title", required: false },
            { key: "start_date", required: false, help: "ISO date, e.g. 2025-04-15" },
            { key: "annual_hours", required: false, help: "Integer 0–4000; default 1880" },
            {
              key: "status",
              required: false,
              help: "active / inactive / on_leave; default active",
            },
          ]}
          serverAction={importInstructorsCsv}
          trigger={
            <button
              type="button"
              className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              Import CSV
            </button>
          }
        />
        <ManagerOnly>
          <InstructorFormDialog
            mode="create"
            trigger={
              <button
                type="button"
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                Add <Label kind="entity.instructor" />
              </button>
            }
          />
        </ManagerOnly>
      </div>
    </div>
  );
}
