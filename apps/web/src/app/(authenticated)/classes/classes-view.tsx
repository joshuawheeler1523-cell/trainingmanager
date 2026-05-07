"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/ui/data-table";
import ClassFormDialog from "./class-form-dialog";
import type { ClassWithHours, Instructor } from "@arbor/shared";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
};

function StatusBadge({ status, deleted }: { status: string; deleted: boolean }) {
  const label = deleted ? "Archived" : status;
  const cls = deleted
    ? "bg-gray-100 text-gray-600"
    : (STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600");
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
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
};

export default function ClassesView({ classes, instructors, showDeleted }: Props) {
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
      </div>
      <DataTable data={classes} columns={columns} searchPlaceholder="Search classes…" />
    </div>
  );
}
