"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilSquareIcon, ArchiveBoxIcon, ArrowUturnLeftIcon } from "@heroicons/react/20/solid";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import InstructorFormDialog from "@/app/(authenticated)/instructors/instructor-form-dialog";
import { softDeleteInstructor, restoreInstructor } from "@/app/(authenticated)/instructors/actions";
import type { Instructor } from "@arbor/shared";

type AuditEntry = {
  id: number;
  operation: string;
  changed_fields: string[] | null;
  old_values: unknown;
  new_values: unknown;
  occurred_at: string;
  actor_id: string | null;
};

type Props = {
  instructor: Instructor;
  auditEntries: AuditEntry[];
};

type Tab = "overview" | "skills" | "workload" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "skills", label: "Skills" },
  { id: "workload", label: "Workload" },
  { id: "audit", label: "Audit" },
];

function OverviewTab({ instructor }: { instructor: Instructor }) {
  const fields: { label: string; value: string | null | undefined }[] = [
    { label: "Full name", value: instructor.full_name },
    { label: "Email", value: instructor.email },
    { label: "Phone", value: instructor.phone },
    { label: "Department", value: instructor.department },
    { label: "Location", value: instructor.location },
    { label: "Job title", value: instructor.job_title },
    { label: "Start date", value: instructor.start_date },
    { label: "Annual hours", value: String(instructor.annual_hours) },
    { label: "Status", value: instructor.status },
    { label: "Notes", value: instructor.notes },
  ];

  return (
    <div className="space-y-6">
      <div className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-4 text-sm font-semibold">Profile</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {fields.map(({ label, value }) =>
            value ? (
              <div key={label}>
                <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
                <dd className="text-foreground mt-0.5 text-sm">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </div>

      {/* Capacity forecast placeholder */}
      <div className="border-border bg-surface rounded-xl border border-dashed p-6 text-center">
        <p className="text-foreground text-sm font-medium">8-Week Capacity Forecast</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Forecast available after workload sources are configured (Phase 3).
        </p>
      </div>

      {/* Allocation buckets placeholder */}
      <div className="border-border bg-surface rounded-xl border border-dashed p-6 text-center">
        <p className="text-foreground text-sm font-medium">Allocation Buckets</p>
        <p className="text-muted-foreground mt-1 text-xs">
          No allocation set yet — bucket usage will appear here after Phase 2.
        </p>
      </div>
    </div>
  );
}

function SkillsTab() {
  return (
    <div className="border-border bg-surface rounded-xl border border-dashed p-12 text-center">
      <p className="text-foreground text-sm font-medium">Skills</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Skill tracking will be available in Phase 1.3.
      </p>
    </div>
  );
}

function WorkloadTab() {
  return (
    <div className="border-border bg-surface rounded-xl border border-dashed p-12 text-center">
      <p className="text-foreground text-sm font-medium">Workload</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Workload view requires allocation data from Phase 2 and 3.
      </p>
    </div>
  );
}

function AuditTab({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">No audit events yet.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-border bg-surface border-b">
          <tr>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Time
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Operation
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Changed fields
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {entries.map((e) => (
            <tr key={e.id} className="hover:bg-surface">
              <td className="text-muted-foreground px-4 py-2.5 text-xs">
                {new Date(e.occurred_at).toLocaleString()}
              </td>
              <td className="text-foreground px-4 py-2.5 text-xs font-medium">{e.operation}</td>
              <td className="text-muted-foreground px-4 py-2.5 text-xs">
                {e.changed_fields?.join(", ") ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InstructorDetailClient({ instructor, auditEntries }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();

  const isDeleted = !!instructor.deleted_at;

  function handleSoftDelete() {
    startTransition(async () => {
      const result = await softDeleteInstructor(instructor.id);
      if (result.ok) {
        toast.success("Instructor archived");
        router.push("/instructors");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreInstructor(instructor.id);
      if (result.ok) {
        toast.success("Instructor restored");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="border-border bg-background flex items-start justify-between gap-4 border-b px-6 py-4">
        <div>
          <h1 className="text-foreground text-lg font-semibold">{instructor.full_name}</h1>
          {instructor.job_title && (
            <p className="text-muted-foreground mt-0.5 text-sm">{instructor.job_title}</p>
          )}
          {isDeleted && (
            <span className="bg-capacity-red-bg text-capacity-red mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium">
              Archived
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isDeleted ? (
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  className="border-border text-foreground hover:bg-surface flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
                >
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                  Restore
                </button>
              }
              title="Restore instructor?"
              description="This instructor will be visible in the roster again."
              confirmLabel="Restore"
              onConfirm={handleRestore}
            />
          ) : (
            <>
              <InstructorFormDialog
                mode="edit"
                instructor={instructor}
                trigger={
                  <button
                    type="button"
                    className="border-border text-foreground hover:bg-surface flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit
                  </button>
                }
              />
              <ConfirmDialog
                trigger={
                  <button
                    type="button"
                    disabled={pending}
                    className="border-border text-destructive hover:bg-surface flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    <ArchiveBoxIcon className="h-4 w-4" />
                    Archive
                  </button>
                }
                title="Archive instructor?"
                description="This instructor will be hidden from the roster. You can restore them later."
                confirmLabel="Archive"
                destructive
                onConfirm={handleSoftDelete}
              />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-border bg-background border-b px-6">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
              }}
              className={`border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "overview" && <OverviewTab instructor={instructor} />}
        {activeTab === "skills" && <SkillsTab />}
        {activeTab === "workload" && <WorkloadTab />}
        {activeTab === "audit" && <AuditTab entries={auditEntries} />}
      </div>
    </div>
  );
}
