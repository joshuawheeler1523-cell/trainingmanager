"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  PencilSquareIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  PlusIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/20/solid";
import ClassFormDialog from "@/app/(authenticated)/classes/class-form-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  softDeleteClass,
  restoreClass,
  assignInstructorToClass,
  unassignInstructorFromClass,
  updateAssignment,
  distributeOfferingsEvenly,
} from "@/app/(authenticated)/classes/actions";
import {
  createRoadmapStep,
  updateRoadmapStep,
  deleteRoadmapStep,
  moveRoadmapStep,
} from "@/app/(authenticated)/classes/roadmap-actions";
import {
  addClassSkillRequirement,
  updateClassSkillRequirement,
  removeClassSkillRequirement,
} from "@/app/(authenticated)/skills/actions";
import {
  PROFICIENCY_VALUES,
  REQUIREMENT_VALUES,
  CLASS_MODALITY_VALUES,
  CLASS_MODALITY_LABELS,
} from "@arbor/shared";
import type {
  ClassWithHours,
  Instructor,
  Skill,
  Proficiency,
  Requirement,
  ClassModality,
  SuperUser,
} from "@arbor/shared";
import ClassSuperUsersTab from "./class-super-users-tab";
import { Label, useLabel } from "@/components/labels";
import type { Assignment, RequirementRow, RoadmapStep } from "./page";

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
  requirements: RequirementRow[];
  allSkills: Skill[];
  qualifiedInstructorCount: number;
  roadmapSteps: RoadmapStep[];
  superUsers: SuperUser[];
};

type Tab = "overview" | "roadmap" | "instructors" | "skills" | "super_users" | "audit";

// Tab labels are computed inside the component now so the "instructors" tab
// can carry the org's terminology label. Constant kept as a fallback shape.
type TabDef = { id: Tab; label: React.ReactNode };

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

type AssignmentRole = "eligible" | "primary" | "backup";

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
  const [addingId, setAddingId] = useState("");
  const instructorLower = useLabel("entity.instructor", { lower: true });

  // Optimistic assignments list — edits to role/offerings reflect
  // instantly via the chip + input + aggregate totals at the top.
  // useOptimistic auto-reverts on transition failure.
  const [optimisticAssignments, applyAssignmentPatch] = useOptimistic(
    assignments,
    (
      state,
      patch: { instructor_id: string; role?: AssignmentRole; assigned_offerings?: number },
    ) => {
      const idx = state.findIndex((a) => a.instructor_id === patch.instructor_id);
      if (idx < 0) return state;
      const next = state.slice();
      const cur = next[idx];
      if (!cur) return state;
      next[idx] = {
        ...cur,
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.assigned_offerings !== undefined
          ? { assigned_offerings: patch.assigned_offerings }
          : {}),
      };
      return next;
    },
  );

  const assignedIds = new Set(optimisticAssignments.map((a) => a.instructor_id));
  const available = allInstructors.filter((i) => !assignedIds.has(i.id));

  function instructorName(id: string) {
    return allInstructors.find((i) => i.id === id)?.full_name ?? id;
  }

  function saveRole(instructorId: string, nextRole: AssignmentRole, currentOfferings: number) {
    startTransition(async () => {
      applyAssignmentPatch({ instructor_id: instructorId, role: nextRole });
      const result = await updateAssignment(classId, instructorId, {
        role: nextRole,
        assigned_offerings: currentOfferings,
      });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function saveOfferings(instructorId: string, nextOfferings: number, currentRole: AssignmentRole) {
    startTransition(async () => {
      applyAssignmentPatch({ instructor_id: instructorId, assigned_offerings: nextOfferings });
      const result = await updateAssignment(classId, instructorId, {
        role: currentRole,
        assigned_offerings: nextOfferings,
      });
      if (!result.ok) toast.error(result.error.message);
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

  function distributeEvenly() {
    startTransition(async () => {
      const result = await distributeOfferingsEvenly(classId);
      if (result.ok) {
        toast.success(
          `Distributed ${String(result.data.total)} offerings across ${String(result.data.count)} instructors`,
        );
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const totalAssigned = optimisticAssignments.reduce((s, a) => s + a.assigned_offerings, 0);
  const remaining = offeringsPerYear - totalAssigned;

  return (
    <div className="space-y-4">
      {/* Toolbar: add + distribute + summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {available.length > 0 && (
            <>
              <select
                value={addingId}
                onChange={(e) => {
                  setAddingId(e.target.value);
                }}
                className="border-input bg-background text-foreground focus:ring-ring rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
                aria-label={`Select ${instructorLower} to add`}
              >
                <option value="">Select to add…</option>
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
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                <PlusIcon className="h-4 w-4" />
                Add
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {offeringsPerYear > 0 && (
            <span className="text-muted-foreground text-xs">
              <span
                className="text-foreground font-medium tabular-nums"
                style={remaining < 0 ? { color: "var(--destructive)" } : undefined}
              >
                {totalAssigned}
              </span>
              {" / "}
              <span className="tabular-nums">{offeringsPerYear}</span> offerings assigned
              {remaining > 0 && <span className="ml-1">({remaining} unstaffed)</span>}
            </span>
          )}
          {optimisticAssignments.length >= 2 && offeringsPerYear > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={distributeEvenly}
              title="Split offerings_per_year evenly across all assigned instructors"
              className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <ArrowsRightLeftIcon className="h-4 w-4" />
              Distribute evenly
            </button>
          )}
        </div>
      </div>

      {optimisticAssignments.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            No <Label kind="entity.instructor" plural lower /> assigned yet.
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  <Label kind="entity.instructor" />
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
              {optimisticAssignments.map((a) => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  instructorName={instructorName(a.instructor_id)}
                  offeringsPerYear={offeringsPerYear}
                  pending={pending}
                  onRoleChange={(role) => {
                    saveRole(a.instructor_id, role, a.assigned_offerings);
                  }}
                  onOfferingsCommit={(value) => {
                    if (value !== a.assigned_offerings) {
                      saveOfferings(a.instructor_id, value, a.role as AssignmentRole);
                    }
                  }}
                  onRemove={() => {
                    removeAssignment(a.instructor_id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssignmentRow({
  assignment,
  instructorName,
  offeringsPerYear,
  pending,
  onRoleChange,
  onOfferingsCommit,
  onRemove,
}: {
  assignment: Assignment;
  instructorName: string;
  offeringsPerYear: number;
  pending: boolean;
  onRoleChange: (role: AssignmentRole) => void;
  onOfferingsCommit: (value: number) => void;
  onRemove: () => void;
}) {
  // Local mirror for the offerings input so the user can type freely;
  // we commit on blur or Enter.
  const [draftOfferings, setDraftOfferings] = useState(String(assignment.assigned_offerings));

  // Re-sync if the underlying assignment changes (e.g. after distribute-evenly).
  useEffect(() => {
    setDraftOfferings(String(assignment.assigned_offerings));
  }, [assignment.assigned_offerings]);

  function commitOfferings() {
    const n = Number(draftOfferings);
    if (!Number.isFinite(n) || n < 0) {
      setDraftOfferings(String(assignment.assigned_offerings));
      return;
    }
    onOfferingsCommit(Math.floor(n));
  }

  const inputCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <tr className="hover:bg-surface">
      <td className="px-4 py-3">
        <Link
          href={`/instructors/${assignment.instructor_id}`}
          className="text-foreground font-medium hover:underline"
        >
          {instructorName}
        </Link>
      </td>
      <td className="px-4 py-3">
        <select
          value={assignment.role}
          disabled={pending}
          onChange={(e) => {
            onRoleChange(e.target.value as AssignmentRole);
          }}
          className={inputCls}
          aria-label={`Role for ${instructorName}`}
        >
          <option value="eligible">Eligible</option>
          <option value="primary">Primary</option>
          <option value="backup">Backup</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={0}
          max={offeringsPerYear || undefined}
          step={1}
          value={draftOfferings}
          disabled={pending}
          onChange={(e) => {
            setDraftOfferings(e.target.value);
          }}
          onBlur={commitOfferings}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraftOfferings(String(assignment.assigned_offerings));
              e.currentTarget.blur();
            }
          }}
          className={`${inputCls} w-20`}
          aria-label={`Assigned offerings for ${instructorName}`}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          disabled={pending}
          onClick={onRemove}
          className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Remove
        </button>
      </td>
    </tr>
  );
}

function SkillRequirementsTab({
  classId,
  requirements,
  allSkills,
  qualifiedInstructorCount,
}: {
  classId: string;
  requirements: RequirementRow[];
  allSkills: Skill[];
  qualifiedInstructorCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draftSkillId, setDraftSkillId] = useState("");
  const [draftMin, setDraftMin] = useState<Proficiency>("intermediate");
  const [draftReq, setDraftReq] = useState<Requirement>("required");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMin, setEditMin] = useState<Proficiency>("intermediate");
  const [editReq, setEditReq] = useState<Requirement>("required");

  const assignedIds = new Set(requirements.map((r) => r.skill_id));
  const available = allSkills.filter((s) => !assignedIds.has(s.id));

  const requiredCount = requirements.filter((r) => r.requirement === "required").length;

  function resetDraft() {
    setDraftSkillId("");
    setDraftMin("intermediate");
    setDraftReq("required");
    setAdding(false);
  }

  function handleAdd() {
    if (!draftSkillId) {
      toast.error("Pick a skill to require");
      return;
    }
    startTransition(async () => {
      const result = await addClassSkillRequirement(classId, {
        skill_id: draftSkillId,
        min_proficiency: draftMin,
        requirement: draftReq,
      });
      if (result.ok) {
        toast.success("Requirement added");
        resetDraft();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function startEdit(row: RequirementRow) {
    setEditingId(row.id);
    setEditMin(row.min_proficiency);
    setEditReq(row.requirement);
  }

  function saveEdit(rowId: string) {
    startTransition(async () => {
      const result = await updateClassSkillRequirement(rowId, classId, {
        min_proficiency: editMin,
        requirement: editReq,
      });
      if (result.ok) {
        toast.success("Requirement updated");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(rowId: string) {
    startTransition(async () => {
      const result = await removeClassSkillRequirement(rowId, classId);
      if (result.ok) {
        toast.success("Requirement removed");
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
      {/* Qualified-instructor summary */}
      <div className="border-border bg-background rounded-xl border p-4">
        <div className="flex items-baseline gap-3">
          <span className="text-foreground text-2xl font-semibold">{qualifiedInstructorCount}</span>
          <span className="text-muted-foreground text-sm">
            qualified instructor{qualifiedInstructorCount === 1 ? "" : "s"}
          </span>
          {requiredCount > 0 && (
            <span className="text-muted-foreground text-xs">
              ({requiredCount} required skill{requiredCount === 1 ? "" : "s"})
            </span>
          )}
        </div>
        {qualifiedInstructorCount === 0 && requiredCount > 0 && (
          <p className="text-destructive mt-1 text-xs">
            No active instructors meet all required skills at the minimum proficiency.
          </p>
        )}
      </div>

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
            Add requirement
          </button>
        )}
      </div>

      {adding && (
        <div className="border-border bg-background space-y-3 rounded-xl border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="add-req-skill"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Skill *
              </label>
              <select
                id="add-req-skill"
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
                htmlFor="add-req-min"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Min. proficiency
              </label>
              <select
                id="add-req-min"
                value={draftMin}
                onChange={(e) => {
                  setDraftMin(e.target.value as Proficiency);
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
            <div>
              <label
                htmlFor="add-req-type"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Requirement
              </label>
              <select
                id="add-req-type"
                value={draftReq}
                onChange={(e) => {
                  setDraftReq(e.target.value as Requirement);
                }}
                className={`${inputCls} w-full capitalize`}
              >
                {REQUIREMENT_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
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

      {requirements.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {available.length === 0
              ? "No skills exist in the library yet."
              : "No skill requirements yet — add one to surface qualified instructors."}
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Skill
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Min. proficiency
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Requirement
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {requirements.map((row) => (
                <tr key={row.id} className="hover:bg-surface">
                  <td className="text-foreground px-4 py-3 text-sm font-medium">
                    {row.skill.name}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === row.id ? (
                      <select
                        value={editMin}
                        onChange={(e) => {
                          setEditMin(e.target.value as Proficiency);
                        }}
                        className={`${inputCls} capitalize`}
                      >
                        {PROFICIENCY_VALUES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-foreground capitalize">{row.min_proficiency}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === row.id ? (
                      <select
                        value={editReq}
                        onChange={(e) => {
                          setEditReq(e.target.value as Requirement);
                        }}
                        className={`${inputCls} capitalize`}
                      >
                        {REQUIREMENT_VALUES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          row.requirement === "required"
                            ? "bg-primary/10 text-primary"
                            : "bg-surface text-muted-foreground"
                        }`}
                      >
                        {row.requirement}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingId === row.id ? (
                        <>
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
                            className="text-primary hover:text-primary/80 text-xs font-medium disabled:opacity-50"
                          >
                            Save
                          </button>
                        </>
                      ) : (
                        <>
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

function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0m";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${String(m)}m`;
  if (m === 0) return `${String(h)}h`;
  return `${String(h)}h ${String(m)}m`;
}

function RoadmapTab({
  classId,
  steps,
  instructionHoursPerOffering,
}: {
  classId: string;
  steps: RoadmapStep[];
  instructionHoursPerOffering: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draftCompetency, setDraftCompetency] = useState("");
  const [draftModality, setDraftModality] = useState<ClassModality>("ilt");
  const [draftMinutes, setDraftMinutes] = useState("30");
  const [draftNotes, setDraftNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompetency, setEditCompetency] = useState("");
  const [editModality, setEditModality] = useState<ClassModality>("ilt");
  const [editMinutes, setEditMinutes] = useState("0");
  const [editNotes, setEditNotes] = useState("");

  const totalMinutes = steps.reduce((s, r) => s + r.duration_minutes, 0);
  const expectedMinutes =
    instructionHoursPerOffering != null ? Math.round(instructionHoursPerOffering * 60) : null;
  const mismatch = expectedMinutes != null && steps.length > 0 && totalMinutes !== expectedMinutes;
  const diffMinutes = expectedMinutes != null ? totalMinutes - expectedMinutes : 0;

  function resetDraft() {
    setDraftCompetency("");
    setDraftModality("ilt");
    setDraftMinutes("30");
    setDraftNotes("");
    setAdding(false);
  }

  function handleAdd() {
    if (!draftCompetency.trim()) {
      toast.error("Competency is required");
      return;
    }
    const minutes = Number(draftMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Duration must be at least 1 minute");
      return;
    }
    startTransition(async () => {
      const result = await createRoadmapStep(classId, {
        competency: draftCompetency,
        modality: draftModality,
        duration_minutes: minutes,
        notes: draftNotes.trim() || null,
      });
      if (result.ok) {
        toast.success("Step added");
        resetDraft();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function startEdit(row: RoadmapStep) {
    setEditingId(row.id);
    setEditCompetency(row.competency);
    setEditModality(row.modality);
    setEditMinutes(String(row.duration_minutes));
    setEditNotes(row.notes ?? "");
  }

  function saveEdit(rowId: string) {
    const minutes = Number(editMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      toast.error("Duration must be at least 1 minute");
      return;
    }
    startTransition(async () => {
      const result = await updateRoadmapStep(rowId, classId, {
        competency: editCompetency,
        modality: editModality,
        duration_minutes: minutes,
        notes: editNotes.trim() || null,
      });
      if (result.ok) {
        toast.success("Step updated");
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(rowId: string) {
    startTransition(async () => {
      const result = await deleteRoadmapStep(rowId, classId);
      if (result.ok) {
        toast.success("Step removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleMove(rowId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveRoadmapStep(rowId, classId, direction);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  const inputCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Document the curriculum: which competencies are taught, in what format, for how long, and
          in what order.
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
          >
            <PlusIcon className="h-4 w-4" />
            Add step
          </button>
        )}
      </div>

      {adding && (
        <div className="border-border bg-background space-y-3 rounded-xl border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label
                htmlFor="add-step-competency"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Competency *
              </label>
              <input
                id="add-step-competency"
                type="text"
                value={draftCompetency}
                onChange={(e) => {
                  setDraftCompetency(e.target.value);
                }}
                placeholder="e.g., IV start technique"
                className={`${inputCls} w-full`}
              />
            </div>
            <div className="sm:col-span-3">
              <label
                htmlFor="add-step-modality"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Format
              </label>
              <select
                id="add-step-modality"
                value={draftModality}
                onChange={(e) => {
                  setDraftModality(e.target.value as ClassModality);
                }}
                className={`${inputCls} w-full`}
              >
                {CLASS_MODALITY_VALUES.map((m) => (
                  <option key={m} value={m}>
                    {CLASS_MODALITY_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="add-step-minutes"
                className="text-muted-foreground mb-1 block text-xs font-medium"
              >
                Minutes *
              </label>
              <input
                id="add-step-minutes"
                type="number"
                min={1}
                step={1}
                value={draftMinutes}
                onChange={(e) => {
                  setDraftMinutes(e.target.value);
                }}
                className={`${inputCls} w-full`}
              />
            </div>
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={resetDraft}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleAdd}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
          <div>
            <label
              htmlFor="add-step-notes"
              className="text-muted-foreground mb-1 block text-xs font-medium"
            >
              Notes (optional)
            </label>
            <input
              id="add-step-notes"
              type="text"
              value={draftNotes}
              onChange={(e) => {
                setDraftNotes(e.target.value);
              }}
              placeholder="Reference material, prerequisites, anything else worth recording"
              className={`${inputCls} w-full`}
            />
          </div>
        </div>
      )}

      {steps.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            No roadmap steps yet — add one to document the curriculum.
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground w-10 px-3 py-2.5 text-left text-xs font-medium">
                  #
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-left text-xs font-medium">
                  Competency
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-left text-xs font-medium">
                  Format
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-left text-xs font-medium">
                  Duration
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-left text-xs font-medium">
                  Notes
                </th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {steps.map((row, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === steps.length - 1;
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="hover:bg-surface align-top">
                    <td className="text-muted-foreground px-3 py-3 tabular-nums">{idx + 1}</td>
                    <td className="text-foreground px-3 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editCompetency}
                          onChange={(e) => {
                            setEditCompetency(e.target.value);
                          }}
                          className={`${inputCls} w-full`}
                        />
                      ) : (
                        <span className="font-medium">{row.competency}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {isEditing ? (
                        <select
                          value={editModality}
                          onChange={(e) => {
                            setEditModality(e.target.value as ClassModality);
                          }}
                          className={`${inputCls} w-full`}
                        >
                          {CLASS_MODALITY_VALUES.map((m) => (
                            <option key={m} value={m}>
                              {CLASS_MODALITY_LABELS[m]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-foreground bg-surface inline-flex rounded-full px-2 py-0.5 text-xs font-medium">
                          {CLASS_MODALITY_LABELS[row.modality]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={editMinutes}
                          onChange={(e) => {
                            setEditMinutes(e.target.value);
                          }}
                          className={`${inputCls} w-24`}
                        />
                      ) : (
                        <span className="text-foreground">
                          {formatDuration(row.duration_minutes)}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-3 text-xs">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => {
                            setEditNotes(e.target.value);
                          }}
                          className={`${inputCls} w-full`}
                        />
                      ) : (
                        (row.notes ?? "—")
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isEditing ? (
                          <>
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
                              className="text-primary hover:text-primary/80 text-xs font-medium disabled:opacity-50"
                            >
                              Save
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={pending || isFirst}
                              onClick={() => {
                                handleMove(row.id, "up");
                              }}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              aria-label="Move step up"
                              title="Move up"
                            >
                              <ArrowUpIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={pending || isLast}
                              onClick={() => {
                                handleMove(row.id, "down");
                              }}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              aria-label="Move step down"
                              title="Move down"
                            >
                              <ArrowDownIcon className="h-3.5 w-3.5" />
                            </button>
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
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-border bg-surface border-t">
              <tr>
                <td colSpan={3} className="text-muted-foreground px-3 py-2.5 text-xs font-medium">
                  Total
                </td>
                <td className="text-foreground px-3 py-2.5 text-sm font-semibold tabular-nums">
                  {formatDuration(totalMinutes)}
                </td>
                <td colSpan={2} className="text-muted-foreground px-3 py-2.5 text-xs">
                  {expectedMinutes != null && (
                    <>Class instruction time: {formatDuration(expectedMinutes)}</>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {mismatch && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            Roadmap total is {formatDuration(totalMinutes)}, but the class instruction time is{" "}
            {formatDuration(expectedMinutes)} ({diffMinutes > 0 ? "+" : ""}
            {formatDuration(Math.abs(diffMinutes))} {diffMinutes > 0 ? "over" : "under"}). Adjust
            the steps or the class&apos;s hours so they agree.
          </div>
        </div>
      )}
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
  requirements,
  allSkills,
  qualifiedInstructorCount,
  roadmapSteps,
  superUsers,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [pending, startTransition] = useTransition();
  const instructorPlural = useLabel("entity.instructor", { plural: true });

  const TABS: TabDef[] = [
    { id: "overview", label: "Overview" },
    { id: "roadmap", label: "Roadmap" },
    { id: "instructors", label: instructorPlural },
    { id: "skills", label: "Skill Requirements" },
    {
      id: "super_users",
      label: (
        <>
          Super Users
          {superUsers.length > 0 && (
            <span className="bg-surface text-muted-foreground ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
              {superUsers.length}
            </span>
          )}
        </>
      ),
    },
    { id: "audit", label: "Audit" },
  ];

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
        {activeTab === "roadmap" && (
          <RoadmapTab
            classId={cls.id}
            steps={roadmapSteps}
            instructionHoursPerOffering={cls.instruction_hours_per_offering}
          />
        )}
        {activeTab === "instructors" && (
          <InstructorsTab
            classId={cls.id}
            offeringsPerYear={cls.offerings_per_year}
            assignments={assignments}
            allInstructors={allInstructors}
          />
        )}
        {activeTab === "skills" && (
          <SkillRequirementsTab
            classId={cls.id}
            requirements={requirements}
            allSkills={allSkills}
            qualifiedInstructorCount={qualifiedInstructorCount}
          />
        )}
        {activeTab === "super_users" && (
          <ClassSuperUsersTab classId={cls.id} className={cls.name} superUsers={superUsers} />
        )}
        {activeTab === "audit" && <AuditTab entries={auditEntries} />}
      </div>
    </div>
  );
}
