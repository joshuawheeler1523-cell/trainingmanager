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
import { Badge, Eyebrow, Tabs, type TabItem } from "@/components/ui";
import { ReadOnlyBanner } from "@/components/auth/read-only-context";
import { cn } from "@/lib/utils";
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
  // Day-by-day teaching hours feeding the calc panel. Uniform when
  // hours_per_day is set; per-day when custom_day_hours is populated.
  const days: { day: number; hours: number }[] = (() => {
    if (
      cls.is_multi_day &&
      Array.isArray(cls.custom_day_hours) &&
      cls.custom_day_hours.length > 0
    ) {
      return cls.custom_day_hours.map((h, i) => ({ day: i + 1, hours: h || 0 }));
    }
    const total = cls.is_multi_day ? cls.total_days : 1;
    const hpd = cls.hours_per_day ?? 0;
    return Array.from({ length: total }, (_, i) => ({ day: i + 1, hours: hpd }));
  })();

  const prep = cls.prep_hours_per_offering;
  const logistics = cls.logistics_hours_per_offering;
  const teaching = days.reduce((s, d) => s + d.hours, 0);
  const perOffering = teaching + prep + logistics;
  const offerings = cls.offerings_per_year || 0;
  const annual = perOffering * offerings;

  // Top-of-tab structural facts the mock's "Structure" header surfaces.
  const structureMeta = cls.is_multi_day
    ? `Multi-day · ${String(cls.total_days)} day${cls.total_days === 1 ? "" : "s"}`
    : "Single-day";

  return (
    <div className="space-y-6">
      {/* Description, if present — sits above the calc as light context. */}
      {cls.description && (
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{cls.description}</p>
      )}

      {/* Structural inputs — the raw values that feed the calculation. */}
      <section className="border-border bg-background rounded-xl border p-6">
        <div className="border-border mb-4 flex items-baseline justify-between border-b border-dashed pb-3">
          <Eyebrow>Structure</Eyebrow>
          <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.04em]">
            {structureMeta}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CdField label="Offerings / year" value={String(offerings)} unit="cohorts" />
          {days.map((d) => (
            <CdField
              key={d.day}
              label={days.length === 1 ? "Hours" : `Day ${String(d.day)} hours`}
              value={d.hours ? d.hours.toString() : "0"}
              unit="h"
            />
          ))}
          <CdField label="Prep / offering" value={prep.toString()} unit="h" />
          <CdField label="Logistics / offering" value={logistics.toString()} unit="h" />
        </div>

        {/* The "show the math" panel — vertical stack with op markers and a
            forest-green serif total. Signature element of the editorial
            class definition view. */}
        <div className="bg-surface border-border mt-6 rounded-xl border p-5">
          <Eyebrow variant="mute" className="mb-3">
            Computed annual hours
          </Eyebrow>
          <div className="flex flex-col gap-1.5">
            {days.map((d) => (
              <CalcRow
                key={d.day}
                label={days.length === 1 ? "Teaching" : `Day ${String(d.day)} teaching`}
                value={`${d.hours.toString()} h`}
              />
            ))}
            <CalcOp />
            <CalcRow label="Prep (per offering)" value={`${prep.toString()} h`} />
            <CalcOp />
            <CalcRow label="Logistics (per offering)" value={`${logistics.toString()} h`} />
            <CalcRow
              label="Per-offering total"
              value={`${perOffering.toFixed(perOffering % 1 === 0 ? 0 : 1)} h`}
              emphasis
            />
            <CalcOp text="× offerings/year" value={`× ${String(offerings)}`} />
            <CalcTotal
              label="Annual instructor hours"
              value={annual.toFixed(annual % 1 === 0 ? 0 : 1)}
              unit="h / yr"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// Small structural-input tile (used inside the OverviewTab Structure block).
function CdField({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-surface border-border rounded-md border px-3 py-2">
      <div className="text-muted-foreground font-mono text-[9.5px] uppercase tracking-[0.08em]">
        {label}
      </div>
      <div className="font-display text-foreground mt-0.5 flex items-baseline gap-1.5 text-lg leading-none">
        <span className="tabular-nums">{value}</span>
        {unit && (
          <span className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.04em]">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function CalcRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between border-b border-dashed border-[var(--hair-soft)] py-1 font-mono text-[11px] last:border-b-0",
        emphasis ? "text-foreground border-b-[var(--hair)] pt-2" : "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn("tabular-nums", emphasis ? "text-foreground font-medium" : "text-foreground")}
      >
        {value}
      </span>
    </div>
  );
}

function CalcOp({ text = "+", value = "·" }: { text?: string; value?: string }) {
  return (
    <div className="text-muted-foreground flex items-baseline justify-between py-0 font-mono text-[10.5px] leading-none">
      <span>{text}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function CalcTotal({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="mt-2 flex items-baseline justify-between border-t border-[var(--hair)] pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.04em]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-display flex items-baseline gap-1.5 text-[22px] font-medium normal-case leading-none tracking-[-0.01em] text-[var(--forest)]">
        <span className="tabular-nums">{value}</span>
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.04em]">
          {unit}
        </span>
      </span>
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
      if (result.ok) toast.success("Instructor removed");
      else toast.error(result.error.message);
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
            <thead className="border-border border-b border-dashed">
              <tr>
                <th className="text-muted-foreground px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em]">
                  <Label kind="entity.instructor" />
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em]">
                  Role
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em]">
                  Offerings
                  {offeringsPerYear > 0 && (
                    <span className="ml-1 normal-case">/ {offeringsPerYear}</span>
                  )}
                </th>
                <th className="px-4 py-3" />
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

          {/* Editorial summary footer — mirrors the mock's
              "Sum · X / Y · Fully staffed" line under the assignment list. */}
          {offeringsPerYear > 0 && (
            <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t border-dashed px-4 py-3 font-mono text-[10.5px] tracking-[0.04em]">
              <span>
                Sum ·{" "}
                <b
                  className={cn(
                    "font-medium tabular-nums",
                    remaining < 0 ? "text-[var(--red)]" : "text-foreground",
                  )}
                >
                  {totalAssigned} / {offeringsPerYear}
                </b>{" "}
                · capped at offerings/year
              </span>
              <span>
                {remaining === 0 ? (
                  <b className="font-medium text-[var(--forest)]">✓ Fully staffed</b>
                ) : remaining > 0 ? (
                  <span>
                    <b className="text-foreground font-medium">{remaining}</b> unstaffed
                  </span>
                ) : (
                  <b className="font-medium text-[var(--red)]">
                    {Math.abs(remaining)} over offerings/year
                  </b>
                )}
              </span>
            </div>
          )}
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

  // Role chip styling — mono uppercase pill in the editorial palette.
  // Mirrors the mock's `.eligible-tag.primary|backup|eligible` chips.
  const roles: { value: AssignmentRole; label: string; cls: string }[] = [
    {
      value: "primary",
      label: "Primary",
      cls: "bg-[rgba(45,74,46,0.10)] text-[var(--forest)]",
    },
    {
      value: "backup",
      label: "Backup",
      cls: "bg-[rgba(201,138,58,0.14)] text-[var(--persimmon-deep)]",
    },
    {
      value: "eligible",
      label: "Eligible",
      cls: "bg-[rgba(139,157,131,0.18)] text-[#5a6855]",
    },
  ];

  return (
    <tr className="hover:bg-surface">
      <td className="px-4 py-3">
        <Link
          href={`/instructors/${assignment.instructor_id}`}
          className="font-display text-foreground hover:underline"
        >
          {instructorName}
        </Link>
      </td>
      <td className="px-4 py-3">
        <div
          className="inline-flex gap-1"
          role="radiogroup"
          aria-label={`Role for ${instructorName}`}
        >
          {roles.map((r) => {
            const active = assignment.role === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending}
                onClick={() => {
                  if (!active) onRoleChange(r.value);
                }}
                className={cn(
                  "rounded-[3px] px-2 py-1 font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.06em] transition-colors disabled:opacity-50",
                  active ? r.cls : "text-muted-foreground hover:text-foreground bg-transparent",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
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
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(rowId: string) {
    startTransition(async () => {
      const result = await removeClassSkillRequirement(rowId, classId);
      if (result.ok) toast.success("Requirement removed");
      else toast.error(result.error.message);
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

// Editorial modality pill — mirrors the mock's `.modality.<key>` color
// system (forest for ILT, persimmon for video, amber for assessment, …).
// Mono uppercase 9.5px text on a tinted background.
const MODALITY_STYLE: Record<ClassModality, string> = {
  ilt: "bg-[var(--forest)] text-[var(--cream)]",
  vilt: "bg-[var(--sage)] text-[var(--ink)]",
  elearning: "bg-[#4a5b6e] text-[var(--cream)]",
  video: "bg-[var(--persimmon)] text-[var(--ink)]",
  reading: "bg-[var(--sage-soft)] text-[var(--forest-deep)]",
  simulation: "bg-[var(--forest-deep)] text-[var(--cream)]",
  ojt: "bg-[rgba(28,31,28,0.08)] text-[var(--ink-soft)] border border-[var(--hair)]",
  assessment: "bg-[var(--amber)] text-[var(--ink)]",
  blended: "bg-[var(--cream-2)] text-[var(--ink-soft)] border border-[var(--hair)]",
};

const MODALITY_SHORT: Record<ClassModality, string> = {
  ilt: "ILT",
  vilt: "vILT",
  elearning: "eLearn",
  video: "Video",
  reading: "Read",
  simulation: "Sim",
  ojt: "OJT",
  assessment: "Assess",
  blended: "Blend",
};

function ModalityPill({ modality, className }: { modality: ClassModality; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] px-2 py-1 font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.06em]",
        MODALITY_STYLE[modality],
        className,
      )}
      title={CLASS_MODALITY_LABELS[modality]}
    >
      {MODALITY_SHORT[modality]}
    </span>
  );
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
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemove(rowId: string) {
    startTransition(async () => {
      const result = await deleteRoadmapStep(rowId, classId);
      if (result.ok) toast.success("Step removed");
      else toast.error(result.error.message);
    });
  }

  function handleMove(rowId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveRoadmapStep(rowId, classId, direction);
      if (!result.ok) toast.error(result.error.message);
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
                        <ModalityPill modality={row.modality} />
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
            <tfoot className="border-border border-t border-dashed">
              <tr>
                <td
                  colSpan={3}
                  className="text-muted-foreground px-3 py-3 font-mono text-[10.5px] uppercase tracking-[0.04em]"
                >
                  {steps.length} step{steps.length === 1 ? "" : "s"} ·{" "}
                  {expectedMinutes != null && (
                    <span>declared {formatDuration(expectedMinutes)}</span>
                  )}
                </td>
                <td className="font-display text-foreground px-3 py-3 text-base font-medium tabular-nums">
                  {formatDuration(totalMinutes)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Editorial soft warning — "guide, don't gate" callout when the
          roadmap totals drift from the declared structural hours. */}
      {mismatch && (
        <div className="border-border bg-surface flex items-start gap-3 rounded-xl border border-l-[3px] border-l-[var(--persimmon)] p-4">
          <span className="mt-0.5 shrink-0 text-[var(--persimmon-deep)]">
            <ExclamationTriangleIcon className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-foreground text-sm font-medium">
              Roadmap is {formatDuration(Math.abs(diffMinutes))}{" "}
              {diffMinutes > 0 ? "over" : "under"} the declared instruction time.
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-[10.5px] tracking-[0.02em]">
              Declared {formatDuration(expectedMinutes)} · roadmap sums to{" "}
              {formatDuration(totalMinutes)}. Nudge — not a blocker. Adjust the structure or trim a
              step.
            </p>
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
      if (result.ok) toast.success("Class restored");
      else toast.error(result.error.message);
    });
  }

  // Map TabDef → editorial Tabs primitive's TabItem shape.
  const tabItems: TabItem<Tab>[] = TABS.map((t) => ({ id: t.id, label: t.label }));

  return (
    <div>
      <div className="px-6 pt-4">
        <ReadOnlyBanner />
      </div>
      {/* Header — eyebrow breadcrumb + serif title + status badge */}
      <div className="border-border bg-background flex items-start justify-between gap-4 border-b px-6 py-5">
        <div>
          <Eyebrow className="mb-2">Catalog · Class definition</Eyebrow>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-foreground text-2xl font-medium leading-tight tracking-[-0.005em]">
              {cls.name}
            </h1>
            {isDeleted ? (
              <Badge variant="neutral">Archived</Badge>
            ) : cls.status === "active" ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="neutral">{cls.status}</Badge>
            )}
          </div>
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
      <Tabs<Tab>
        tabs={tabItems}
        value={activeTab}
        onChange={(id) => {
          setActiveTab(id);
        }}
      />

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
