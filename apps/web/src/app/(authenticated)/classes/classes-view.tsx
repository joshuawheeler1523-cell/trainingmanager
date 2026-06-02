"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowUpTrayIcon, BookOpenIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/ui/data-table";
import { Badge } from "@/components/ui";
import RecommendationsBanner from "@/components/recommendations-banner";
import CsvImportDialog from "@/components/csv-import-dialog";
import ClassFormDialog from "./class-form-dialog";
import { ManagerOnly } from "@/components/auth/role-gate";
import { importClassesCsv } from "./actions";
import type { ClassWithHours, Instructor, Recommendation } from "@arbor/shared";

function StatusBadge({ status, deleted }: { status: string; deleted: boolean }) {
  if (deleted) return <Badge variant="neutral">Archived</Badge>;
  if (status === "active") return <Badge variant="success">Active</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

const columns: ColumnDef<ClassWithHours>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/classes/${row.original.id}`}
        className="text-foreground font-medium hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge status={row.original.status} deleted={!!row.original.deleted_at} />
    ),
  },
  {
    accessorKey: "offerings_per_year",
    header: "Offerings/yr",
    cell: ({ getValue }) => <span className="text-sm">{String(getValue<number>())}</span>,
  },
  {
    accessorKey: "total_hours_per_offering",
    header: "Hrs/offering",
    cell: ({ getValue }) => {
      const val = getValue<number | null>();
      return (
        <span className="text-muted-foreground text-sm">{val != null ? val.toFixed(1) : "—"}</span>
      );
    },
  },
  {
    accessorKey: "annual_class_hours",
    header: "Annual hrs",
    cell: ({ getValue }) => {
      const val = getValue<number | null>();
      return (
        <span className="text-muted-foreground text-sm">{val != null ? val.toFixed(1) : "—"}</span>
      );
    },
  },
  {
    accessorKey: "total_days",
    header: "Days",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.is_multi_day ? row.original.total_days : 1}
      </span>
    ),
  },
];

type Props = {
  classes: ClassWithHours[];
  instructors: Instructor[];
  showDeleted: boolean;
  recommendations: Recommendation[];
};

export default function ClassesView({ classes, instructors, showDeleted, recommendations }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function toggleDeleted(checked: boolean) {
    const params = new URLSearchParams(sp.toString());
    if (checked) {
      params.set("deleted", "1");
    } else {
      params.delete("deleted");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <RecommendationsBanner
        title="Coverage warnings"
        recommendations={recommendations}
        defaultExpanded={false}
      />
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => {
              toggleDeleted(e.target.checked);
            }}
            className="border-input rounded"
          />
          Show archived
        </label>
        <div className="flex items-center gap-2">
          <Link
            href="/classes/catalog"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
            title="Generate a printable PDF course catalog"
          >
            <BookOpenIcon className="h-4 w-4" />
            Course Catalog
          </Link>
          <CsvImportDialog
            entity="classes"
            description="Upsert classes by name (case-insensitive). Existing classes with a matching name will be updated; new names will be inserted. Class skill requirements are not imported — add them on each class detail page."
            columns={[
              {
                key: "name",
                required: true,
                help: "Display name; max 200 chars",
                example: "ACLS Certification",
              },
              {
                key: "description",
                required: false,
                example: "Advanced Cardiac Life Support",
              },
              {
                key: "is_multi_day",
                required: false,
                help: "true / yes / 1 — default false",
                example: "false",
              },
              {
                key: "total_days",
                required: false,
                help: "Default 1; ≥2 if is_multi_day",
                example: "1",
              },
              { key: "hours_per_day", required: false, help: "Numeric; default 0", example: "8" },
              {
                key: "custom_day_hours",
                required: false,
                help: "Multi-day classes with different hours each day: list one value per day separated by ; (e.g. 8;6;4). Must match total_days. Leave blank to use hours_per_day for every day.",
                example: "",
              },
              {
                key: "offerings_per_year",
                required: false,
                help: "Integer; default 0",
                example: "12",
              },
              {
                key: "prep_hours_per_offering",
                required: false,
                help: "Numeric; default 0",
                example: "2",
              },
              {
                key: "logistics_hours_per_offering",
                required: false,
                help: "Numeric; default 0",
                example: "1",
              },
              {
                key: "status",
                required: false,
                help: "active or archived; default active",
                example: "active",
              },
            ]}
            serverAction={importClassesCsv}
            trigger={
              <button
                type="button"
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                Import CSV
              </button>
            }
          />
          <ManagerOnly>
            <ClassFormDialog
              mode="create"
              instructors={instructors}
              trigger={
                <button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
                >
                  + Add class
                </button>
              }
            />
          </ManagerOnly>
        </div>
      </div>
      <DataTable data={classes} columns={columns} searchPlaceholder="Search classes…" />
    </div>
  );
}
