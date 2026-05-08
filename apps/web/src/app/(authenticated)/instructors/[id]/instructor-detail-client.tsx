"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PencilSquareIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import InstructorFormDialog from "@/app/(authenticated)/instructors/instructor-form-dialog";
import { softDeleteInstructor, restoreInstructor } from "@/app/(authenticated)/instructors/actions";
import {
  addInstructorSkill,
  updateInstructorSkill,
  removeInstructorSkill,
} from "@/app/(authenticated)/skills/actions";
import {
  PROFICIENCY_VALUES,
  bucketBreakdown,
  groupWorkloadBySource,
  totalAnnualHours,
} from "@arbor/shared";
import type {
  AllocationBucket,
  CapacityRow,
  ForecastWeek,
  Instructor,
  Proficiency,
  Skill,
  WorkloadRow,
  WorkloadSource,
} from "@arbor/shared";
import type { InstructorSkillRow } from "./page";
import CapacityBar from "@/components/charts/capacity-bar";
import BucketDonut from "@/components/charts/bucket-donut";
import ForecastBars from "@/components/charts/forecast-bars";

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
  instructorSkills: InstructorSkillRow[];
  allSkills: Skill[];
  capacity: CapacityRow | null;
  workloadRows: WorkloadRow[];
  forecast: ForecastWeek[];
  buckets: AllocationBucket[];
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

function SkillsTab({
  instructorId,
  instructorSkills,
  allSkills,
}: {
  instructorId: string;
  instructorSkills: InstructorSkillRow[];
  allSkills: Skill[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draftSkillId, setDraftSkillId] = useState("");
  const [draftProf, setDraftProf] = useState<Proficiency>("intermediate");
  const [draftIsCert, setDraftIsCert] = useState(false);
  const [draftCertifiedAt, setDraftCertifiedAt] = useState("");
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [draftCertUrl, setDraftCertUrl] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProf, setEditProf] = useState<Proficiency>("intermediate");
  const [editIsCert, setEditIsCert] = useState(false);
  const [editCertifiedAt, setEditCertifiedAt] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editCertUrl, setEditCertUrl] = useState("");

  const assignedSkillIds = new Set(instructorSkills.map((is) => is.skill_id));
  const available = allSkills.filter((s) => !assignedSkillIds.has(s.id));

  function resetDraft() {
    setDraftSkillId("");
    setDraftProf("intermediate");
    setDraftIsCert(false);
    setDraftCertifiedAt("");
    setDraftExpiresAt("");
    setDraftCertUrl("");
    setAdding(false);
  }

  function handleAdd() {
    if (!draftSkillId) {
      toast.error("Pick a skill to add");
      return;
    }
    startTransition(async () => {
      const result = await addInstructorSkill(instructorId, {
        skill_id: draftSkillId,
        proficiency: draftProf,
        is_certified: draftIsCert,
        certified_at: draftCertifiedAt || null,
        expires_at: draftExpiresAt || null,
        certificate_url: draftCertUrl || null,
      });
      if (result.ok) {
        toast.success("Skill added");
        resetDraft();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function startEdit(row: InstructorSkillRow) {
    setEditingId(row.id);
    setEditProf(row.proficiency);
    setEditIsCert(row.is_certified);
    setEditCertifiedAt(row.certified_at ?? "");
    setEditExpiresAt(row.expires_at ?? "");
    setEditCertUrl(row.certificate_url ?? "");
  }

  function saveEdit(rowId: string) {
    startTransition(async () => {
      const result = await updateInstructorSkill(rowId, instructorId, {
        proficiency: editProf,
        is_certified: editIsCert,
        certified_at: editCertifiedAt || null,
        expires_at: editExpiresAt || null,
        certificate_url: editCertUrl || null,
      });
      if (result.ok) {
        toast.success("Skill updated");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(rowId: string) {
    startTransition(async () => {
      const result = await removeInstructorSkill(rowId, instructorId);
      if (result.ok) {
        toast.success("Skill removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const inputCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  function expiringSoon(date: string | null): boolean {
    if (!date) return false;
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {!adding && available.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            <PlusIcon className="h-4 w-4" />
            Add skill
          </button>
        )}
      </div>

      {adding && (
        <div className="border-border bg-background space-y-3 rounded-xl border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="add-skill"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Skill *
              </label>
              <select
                id="add-skill"
                value={draftSkillId}
                onChange={(e) => {
                  setDraftSkillId(e.target.value);
                }}
                className={`${inputCls} w-full`}
              >
                <option value="">Select skill…</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="add-prof"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Proficiency
              </label>
              <select
                id="add-prof"
                value={draftProf}
                onChange={(e) => {
                  setDraftProf(e.target.value as Proficiency);
                }}
                className={`${inputCls} w-full capitalize`}
              >
                {PROFICIENCY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draftIsCert}
              onChange={(e) => {
                setDraftIsCert(e.target.checked);
              }}
              className="border-border h-3.5 w-3.5 rounded"
            />
            <span className="text-foreground text-xs font-medium">
              This is a certification (track expiry)
            </span>
          </label>

          {draftIsCert && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="add-cert-at"
                  className="text-muted-foreground mb-1 block text-xs font-medium"
                >
                  Certified on
                </label>
                <input
                  id="add-cert-at"
                  type="date"
                  value={draftCertifiedAt}
                  onChange={(e) => {
                    setDraftCertifiedAt(e.target.value);
                  }}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div>
                <label
                  htmlFor="add-exp"
                  className="text-muted-foreground mb-1 block text-xs font-medium"
                >
                  Expires
                </label>
                <input
                  id="add-exp"
                  type="date"
                  value={draftExpiresAt}
                  onChange={(e) => {
                    setDraftExpiresAt(e.target.value);
                  }}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div>
                <label
                  htmlFor="add-url"
                  className="text-muted-foreground mb-1 block text-xs font-medium"
                >
                  Certificate URL
                </label>
                <input
                  id="add-url"
                  type="url"
                  value={draftCertUrl}
                  onChange={(e) => {
                    setDraftCertUrl(e.target.value);
                  }}
                  placeholder="https://…"
                  className={`${inputCls} w-full`}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={resetDraft}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !draftSkillId}
              onClick={handleAdd}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {instructorSkills.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {available.length === 0
              ? "No skills exist in the library yet."
              : "No skills assigned. Click “Add skill” to start."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {instructorSkills.map((row) => {
            const isEditing = editingId === row.id;
            const expiring = expiringSoon(row.expires_at);
            return (
              <div
                key={row.id}
                className={`bg-background rounded-xl border p-4 ${
                  expiring ? "border-destructive" : "border-border"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="text-foreground text-sm font-semibold">{row.skill.name}</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <select
                        value={editProf}
                        onChange={(e) => {
                          setEditProf(e.target.value as Proficiency);
                        }}
                        className={`${inputCls} w-full capitalize`}
                      >
                        {PROFICIENCY_VALUES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editIsCert}
                          onChange={(e) => {
                            setEditIsCert(e.target.checked);
                          }}
                          className="border-border h-3.5 w-3.5 rounded"
                        />
                        <span className="text-foreground text-xs font-medium">Certification</span>
                      </label>
                    </div>
                    {editIsCert && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <input
                          type="date"
                          value={editCertifiedAt}
                          onChange={(e) => {
                            setEditCertifiedAt(e.target.value);
                          }}
                          className={`${inputCls} w-full`}
                        />
                        <input
                          type="date"
                          value={editExpiresAt}
                          onChange={(e) => {
                            setEditExpiresAt(e.target.value);
                          }}
                          className={`${inputCls} w-full`}
                        />
                        <input
                          type="url"
                          placeholder="https://…"
                          value={editCertUrl}
                          onChange={(e) => {
                            setEditCertUrl(e.target.value);
                          }}
                          className={`${inputCls} w-full`}
                        />
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                        }}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          saveEdit(row.id);
                        }}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-foreground text-sm font-semibold">
                          {row.skill.name}
                        </span>
                        <span className="bg-surface text-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize">
                          {row.proficiency}
                        </span>
                        {row.is_certified && (
                          <span className="bg-primary/10 text-primary inline-flex rounded-full px-2 py-0.5 text-xs font-medium">
                            Certified
                          </span>
                        )}
                        {expiring && (
                          <span className="bg-destructive/10 text-destructive inline-flex rounded-full px-2 py-0.5 text-xs font-medium">
                            Expiring soon
                          </span>
                        )}
                      </div>
                      {row.is_certified && (
                        <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 text-xs">
                          {row.certified_at && <span>Certified: {row.certified_at}</span>}
                          {row.expires_at && <span>Expires: {row.expires_at}</span>}
                          {row.certificate_url && (
                            <a
                              href={row.certificate_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              View certificate ↗
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(row);
                        }}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                      >
                        <PencilSquareIcon className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          handleRemove(row.id);
                        }}
                        className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkloadTab({
  capacity,
  workloadRows,
  forecast,
  buckets,
  annualHours,
}: {
  capacity: CapacityRow | null;
  workloadRows: WorkloadRow[];
  forecast: ForecastWeek[];
  buckets: AllocationBucket[];
  annualHours: number;
}) {
  const grouped = groupWorkloadBySource(workloadRows);
  const slices = bucketBreakdown(workloadRows, buckets);
  const assigned = capacity?.assigned_hours ?? totalAnnualHours(workloadRows);
  const totalSourceHours = (k: WorkloadSource) =>
    grouped[k].reduce((acc, r) => acc + (r.annual_hours || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top: capacity bar + bucket donut */}
      <div className="border-border bg-background grid grid-cols-1 gap-6 rounded-xl border p-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <h3 className="text-foreground text-sm font-semibold">Annual capacity</h3>
          <CapacityBar assigned={assigned} capacity={annualHours} />
          <p className="text-muted-foreground text-xs">
            {capacity?.utilization_status === "over_allocated" &&
              "This instructor is over-allocated. Consider redistributing hours."}
            {capacity?.utilization_status === "at_risk" &&
              "Approaching capacity — limited room for new assignments."}
            {capacity?.utilization_status === "balanced" &&
              "Healthy utilization with room for new work."}
            {capacity?.utilization_status === "under_utilized" &&
              "Significant room for additional assignments."}
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <BucketDonut
            slices={slices}
            centerLabel={`${assigned.toFixed(0)}h`}
            centerSubLabel="assigned"
          />
        </div>
      </div>

      {/* Forecast */}
      <div className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-3 text-sm font-semibold">8-week capacity forecast</h3>
        <ForecastBars weeks={forecast} />
      </div>

      {/* Per-source sections */}
      <SourceSection
        title="Classes"
        total={totalSourceHours("class")}
        rows={grouped.class}
        emptyMessage="No class assignments. Add this instructor to a class via /classes."
      />
      <SourceSection
        title="Recurring tasks"
        total={totalSourceHours("recurring_task")}
        rows={grouped.recurring_task}
        emptyMessage="No recurring tasks. Configure them in Allocations → Recurring."
      />
      <SourceSection
        title="Ad-hoc tasks"
        total={totalSourceHours("ad_hoc_task")}
        rows={grouped.ad_hoc_task}
        emptyMessage="No active ad-hoc tasks. (Done/cancelled tasks are excluded from workload.)"
      />
      <SourceSection
        title="Education requests"
        total={totalSourceHours("education_request")}
        rows={grouped.education_request}
        emptyMessage="No assigned education requests. Assign this instructor in /request-queue."
      />

      <SourceSection
        title="Project tasks"
        total={totalSourceHours("project_task")}
        rows={grouped.project_task}
        emptyMessage="No active project task assignments. Assign this instructor to tasks in /projects."
      />
    </div>
  );
}

function SourceSection({
  title,
  total,
  rows,
  emptyMessage,
}: {
  title: string;
  total: number;
  rows: WorkloadRow[];
  emptyMessage: string;
}) {
  const [open, setOpen] = useState(rows.length > 0);
  return (
    <section className="border-border bg-background rounded-xl border">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
        }}
        className="hover:bg-surface flex w-full items-center justify-between rounded-xl px-4 py-3"
      >
        <span className="text-foreground text-sm font-semibold">
          {title} ({rows.length})
        </span>
        <span className="text-foreground text-sm font-semibold tabular-nums">
          {total.toFixed(0)} h
        </span>
      </button>
      {open && (
        <>
          {rows.length === 0 ? (
            <p className="text-muted-foreground border-border border-t px-4 py-3 text-xs">
              {emptyMessage}
            </p>
          ) : (
            <ul className="divide-border border-border divide-y border-t">
              {rows.map((r) => (
                <li
                  key={`${r.source}-${r.source_id}`}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span className="text-foreground">{r.source_label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {(r.annual_hours || 0).toFixed(1)} h/yr
                    {r.quantity != null && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        × {r.quantity.toString()}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
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

export default function InstructorDetailClient({
  instructor,
  auditEntries,
  instructorSkills,
  allSkills,
  capacity,
  workloadRows,
  forecast,
  buckets,
}: Props) {
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
        {activeTab === "skills" && (
          <SkillsTab
            instructorId={instructor.id}
            instructorSkills={instructorSkills}
            allSkills={allSkills}
          />
        )}
        {activeTab === "workload" && (
          <WorkloadTab
            capacity={capacity}
            workloadRows={workloadRows}
            forecast={forecast}
            buckets={buckets}
            annualHours={instructor.annual_hours}
          />
        )}
        {activeTab === "audit" && <AuditTab entries={auditEntries} />}
      </div>
    </div>
  );
}
