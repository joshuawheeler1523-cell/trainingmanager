"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PencilSquareIcon, ArchiveBoxIcon, ArrowUturnLeftIcon } from "@heroicons/react/20/solid";
import ClassFormDialog from "@/app/(authenticated)/classes/class-form-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  softDeleteClass,
  restoreClass,
  assignInstructorToClass,
  unassignInstructorFromClass,
  updateAssignment,
} from "@/app/(authenticated)/classes/actions";
import type { ClassWithHours, Instructor } from "@arbor/shared";
import type { Assignment } from "./page";

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
  cls: ClassWithHours;
  assignments: Assignment[];
  allInstructors: Instructor[];
  auditEntries: AuditEntry[];
};

type Tab = "overview" | "instructors" | "skills" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "instructors", label: "Instructors" },
  { id: "skills", label: "Skill Requirements" },
  { id: "audit", label: "Audit" },
];

function OverviewTab({ cls }: { cls: ClassWithHours }) {
  const fields: { label: string; value: string | null | undefined }[] = [
    { label: "Status", value: cls.status },
    { label: "Description", value: cls.description },
    {
      label: "Type",
      value: cls.is_multi_day ? `Multi-day (${String(cls.total_days)} days)` : "Single-day",
    },
    { label: "Hours per day", value: cls.hours_per_day != null ? String(cls.hours_per_day) : null },
    { label: "Offerings per year", value: String(cls.offerings_per_year) },
    { label: "Prep hrs/offering", value: String(cls.prep_hours_per_offering) },
    { label: "Logistics hrs/offering", value: String(cls.logistics_hours_per_offering) },
  ];

  return (
    <div className="space-y-6">
      <div className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-4 text-sm font-semibold">Class details</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {fields.map(({ label, value }) =>
            value != null ? (
              <div key={label}>
                <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
                <dd className="text-foreground mt-0.5 text-sm">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </div>

      {cls.is_multi_day &&
        Array.isArray(cls.custom_day_hours) &&
        cls.custom_day_hours.length > 0 && (
          <div className="border-border bg-background rounded-xl border p-6">
            <h3 className="text-foreground mb-4 text-sm font-semibold">Custom day hours</h3>
            <div className="flex flex-wrap gap-2">
              {cls.custom_day_hours.map((h, i) => (
                <div
                  key={i}
                  className="border-border bg-surface rounded-md border px-3 py-1.5 text-sm"
                >
                  <span className="text-muted-foreground text-xs">Day {i + 1}</span>
                  <span className="text-foreground ml-2 font-medium">{h}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

      <div className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-4 text-sm font-semibold">Computed hours</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs font-medium">Instruction hrs/offering</dt>
            <dd className="text-foreground mt-0.5 text-sm">
              {cls.instruction_hours_per_offering != null
                ? cls.instruction_hours_per_offering.toFixed(1)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium">Total hrs/offering</dt>
            <dd className="text-foreground mt-0.5 text-sm">
              {cls.total_hours_per_offering != null ? cls.total_hours_per_offering.toFixed(1) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium">Annual class hours</dt>
            <dd className="text-foreground mt-0.5 text-sm">
              {cls.annual_class_hours != null ? cls.annual_class_hours.toFixed(1) : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function InstructorsTab({
  classId,
  offeringsPerYear,
  assignments,
  allInstructors,
}: {
  classId: string;
  offeringsPerYear: number;
  assignments: Assignment[];
  allInstructors: Instructor[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<"eligible" | "primary" | "backup">("eligible");
  const [editOfferings, setEditOfferings] = useState(0);
  const [addingId, setAddingId] = useState("");

  const assignedIds = new Set(assignments.map((a) => a.instructor_id));
  const available = allInstructors.filter((i) => !assignedIds.has(i.id));

  function instructorName(id: string) {
    return allInstructors.find((i) => i.id === id)?.full_name ?? id;
  }

  function startEdit(a: Assignment) {
    setEditingId(a.id);
    setEditRole(a.role as "eligible" | "primary" | "backup");
    setEditOfferings(a.assigned_offerings);
  }

  function saveEdit(instructorId: string) {
    startTransition(async () => {
      const result = await updateAssignment(classId, instructorId, {
        role: editRole,
        assigned_offerings: editOfferings,
      });
      if (result.ok) {
        toast.success("Assignment updated");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function removeAssignment(instructorId: string) {
    startTransition(async () => {
      const result = await unassignInstructorFromClass(classId, instructorId);
      if (result.ok) {
        toast.success("Instructor removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function addInstructor() {
    if (!addingId) return;
    startTransition(async () => {
      const result = await assignInstructorToClass(classId, {
        instructor_id: addingId,
        role: "eligible",
        assigned_offerings: 0,
      });
      if (result.ok) {
        toast.success("Instructor added");
        setAddingId("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const inputCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-4">
      {available.length > 0 && (
        <div className="flex items-center gap-3">
          <select
            value={addingId}
            onChange={(e) => {
              setAddingId(e.target.value);
            }}
            className={inputCls}
          >
            <option value="">Select instructor to add…</option>
            {available.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!addingId || pending}
            onClick={addInstructor}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">No instructors assigned yet.</p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Instructor
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Role
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Assigned offerings
                  {offeringsPerYear > 0 && (
                    <span className="ml-1 font-normal">/ {offeringsPerYear}</span>
                  )}
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={`/instructors/${a.instructor_id}`}
                      className="text-foreground font-medium hover:underline"
                    >
                      {instructorName(a.instructor_id)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === a.id ? (
                      <select
                        value={editRole}
                        onChange={(e) => {
                          setEditRole(e.target.value as "eligible" | "primary" | "backup");
                        }}
                        className={inputCls}
                      >
                        <option value="eligible">Eligible</option>
                        <option value="primary">Primary</option>
                        <option value="backup">Backup</option>
                      </select>
                    ) : (
                      <span className="text-foreground capitalize">{a.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === a.id ? (
                      <input
                        type="number"
                        min={0}
                        max={offeringsPerYear || undefined}
                        value={editOfferings}
                        onChange={(e) => {
                          setEditOfferings(Number(e.target.value));
                        }}
                        className={`${inputCls} w-20`}
                      />
                    ) : (
                      <span className="text-foreground">{a.assigned_offerings}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {editingId === a.id ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              saveEdit(a.instructor_id);
                            }}
                            className="text-primary hover:text-primary/80 text-xs font-medium disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                            }}
                            className="text-muted-foreground hover:text-foreground text-xs"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              startEdit(a);
                            }}
                            className="text-muted-foreground hover:text-foreground text-xs font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              removeAssignment(a.instructor_id);
                            }}
                            className="text-destructive hover:text-destructive/80 text-xs disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SkillsTab() {
  return (
    <div className="border-border bg-surface rounded-xl border border-dashed p-12 text-center">
      <p className="text-foreground text-sm font-medium">Skill Requirements</p>
      <p className="text-muted-foreground mt-1 text-xs">
        Skill requirement tracking will be available in Phase 1.3.
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

export default function ClassDetailClient({
  cls,
  assignments,
  allInstructors,
  auditEntries,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();

  const isDeleted = !!cls.deleted_at;

  function handleSoftDelete() {
    startTransition(async () => {
      const result = await softDeleteClass(cls.id);
      if (result.ok) {
        toast.success("Class archived");
        router.push("/classes");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreClass(cls.id);
      if (result.ok) {
        toast.success("Class restored");
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
          <h1 className="text-foreground text-lg font-semibold">{cls.name}</h1>
          {cls.description && (
            <p className="text-muted-foreground mt-0.5 text-sm">{cls.description}</p>
          )}
          {isDeleted && (
            <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
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
              title="Restore class?"
              description="This class will be visible in the catalog again."
              confirmLabel="Restore"
              onConfirm={handleRestore}
            />
          ) : (
            <>
              <ClassFormDialog
                mode="edit"
                cls={cls}
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
                title="Archive class?"
                description="This class will be hidden from the catalog. You can restore it later."
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
        {activeTab === "overview" && <OverviewTab cls={cls} />}
        {activeTab === "instructors" && (
          <InstructorsTab
            classId={cls.id}
            offeringsPerYear={cls.offerings_per_year}
            assignments={assignments}
            allInstructors={allInstructors}
          />
        )}
        {activeTab === "skills" && <SkillsTab />}
        {activeTab === "audit" && <AuditTab entries={auditEntries} />}
      </div>
    </div>
  );
}
