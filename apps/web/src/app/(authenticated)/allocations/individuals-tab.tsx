"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { AdjustmentsHorizontalIcon, ArrowPathIcon } from "@heroicons/react/20/solid";
import SliderRow from "./slider-row";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { saveIndividualAllocations, resetIndividualAllocations } from "./actions";
import { sumSlate } from "@arbor/shared";
import type {
  AllocationBucket,
  AllocationGroup,
  AllocationGroupMember,
  AllocationSource,
  GlobalAllocation,
  GroupAllocation,
  IndividualAllocation,
  Instructor,
} from "@arbor/shared";

type Props = {
  buckets: AllocationBucket[];
  instructors: Instructor[];
  globals: GlobalAllocation[];
  groups: AllocationGroup[];
  groupAllocations: GroupAllocation[];
  groupMembers: AllocationGroupMember[];
  individualAllocations: IndividualAllocation[];
};

// Compute the effective allocation source for one instructor, mirroring the
// effective_allocation() SQL function.
function resolveSource(args: {
  instructorId: string;
  individuals: IndividualAllocation[];
  groups: AllocationGroup[];
  groupMembers: AllocationGroupMember[];
  groupAllocations: GroupAllocation[];
  globalsExist: boolean;
}): AllocationSource {
  const { instructorId, individuals, groups, groupMembers, groupAllocations, globalsExist } = args;
  if (individuals.some((ia) => ia.instructor_id === instructorId)) return "individual";

  const memberGroupIds = new Set(
    groupMembers.filter((m) => m.instructor_id === instructorId).map((m) => m.group_id),
  );
  const candidateGroups = groups
    .filter((g) => memberGroupIds.has(g.id))
    .filter((g) => groupAllocations.some((ga) => ga.group_id === g.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (candidateGroups.length > 0) return "group";

  if (globalsExist) return "global";
  return "none";
}

// Compute the effective slate (one entry per active bucket) for an instructor.
function resolveSlate(args: {
  instructorId: string;
  buckets: AllocationBucket[];
  individuals: IndividualAllocation[];
  groups: AllocationGroup[];
  groupMembers: AllocationGroupMember[];
  groupAllocations: GroupAllocation[];
  globals: GlobalAllocation[];
}): { bucket_id: string; target_percent: number }[] {
  const { instructorId, buckets, individuals, groups, groupMembers, groupAllocations, globals } =
    args;

  const indByBucket = new Map(
    individuals
      .filter((i) => i.instructor_id === instructorId)
      .map((i) => [i.bucket_id, i.target_percent]),
  );

  const memberGroupIds = new Set(
    groupMembers.filter((m) => m.instructor_id === instructorId).map((m) => m.group_id),
  );
  const winningGroup = groups
    .filter((g) => memberGroupIds.has(g.id))
    .filter((g) => groupAllocations.some((ga) => ga.group_id === g.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

  const grpByBucket = winningGroup
    ? new Map(
        groupAllocations
          .filter((ga) => ga.group_id === winningGroup.id)
          .map((ga) => [ga.bucket_id, ga.target_percent]),
      )
    : new Map<string, number>();

  const glbByBucket = new Map(globals.map((g) => [g.bucket_id, g.target_percent]));

  return buckets.map((b) => ({
    bucket_id: b.id,
    target_percent: indByBucket.get(b.id) ?? grpByBucket.get(b.id) ?? glbByBucket.get(b.id) ?? 0,
  }));
}

const SOURCE_BADGE: Record<AllocationSource, string> = {
  individual: "bg-primary/10 text-primary",
  group: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  global: "bg-surface text-muted-foreground",
  none: "bg-destructive/10 text-destructive",
};

export default function IndividualsTab({
  buckets,
  instructors,
  globals,
  groups,
  groupAllocations,
  groupMembers,
  individualAllocations,
}: Props) {
  const activeBuckets = useMemo(
    () =>
      [...buckets.filter((b) => !b.is_archived)].sort((a, b) => a.display_order - b.display_order),
    [buckets],
  );

  const activeInstructors = useMemo(
    () =>
      [...instructors.filter((i) => i.deleted_at === null && i.status !== "inactive")].sort(
        (a, b) => a.full_name.localeCompare(b.full_name),
      ),
    [instructors],
  );

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = activeInstructors.filter((i) =>
    search ? i.full_name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  if (activeInstructors.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          Add instructors first, then customize per-person allocations here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        aria-label="Search instructors"
        placeholder="Search instructors…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 sm:w-80"
      />

      <div className="border-border bg-background overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-border bg-surface border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                Instructor
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                Effective source
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {filtered.map((i) => {
              const source = resolveSource({
                instructorId: i.id,
                individuals: individualAllocations,
                groups,
                groupMembers,
                groupAllocations,
                globalsExist: globals.length > 0,
              });
              return (
                <tr key={i.id} className="hover:bg-surface">
                  <td className="text-foreground px-4 py-3 text-sm font-medium">{i.full_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SOURCE_BADGE[source]}`}
                    >
                      {source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(i.id);
                      }}
                      className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs"
                    >
                      <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" />
                      Customize
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(() => {
        if (!editingId) return null;
        const editingInstructor = activeInstructors.find((i) => i.id === editingId);
        if (!editingInstructor) return null;
        return (
          <CustomizeSheet
            instructor={editingInstructor}
            buckets={activeBuckets}
            source={resolveSource({
              instructorId: editingId,
              individuals: individualAllocations,
              groups,
              groupMembers,
              groupAllocations,
              globalsExist: globals.length > 0,
            })}
            initialSlate={resolveSlate({
              instructorId: editingId,
              buckets: activeBuckets,
              individuals: individualAllocations,
              groups,
              groupMembers,
              groupAllocations,
              globals,
            })}
            hasIndividualOverrides={individualAllocations.some(
              (ia) => ia.instructor_id === editingId,
            )}
            onClose={() => {
              setEditingId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

function CustomizeSheet({
  instructor,
  buckets,
  source,
  initialSlate,
  hasIndividualOverrides,
  onClose,
}: {
  instructor: Instructor;
  buckets: AllocationBucket[];
  source: AllocationSource;
  initialSlate: { bucket_id: string; target_percent: number }[];
  hasIndividualOverrides: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [slate, setSlate] = useState(initialSlate);

  // Sync if the instructor changes (props update mid-edit).
  useEffect(() => {
    setSlate(initialSlate);
  }, [initialSlate]);

  const dirty = slate.some(
    (s, i) => initialSlate[i] === undefined || s.target_percent !== initialSlate[i].target_percent,
  );
  const { sum, isHundred } = sumSlate(slate);

  function setBucketValue(bucketId: string, value: number) {
    setSlate((prev) =>
      prev.map((s) => (s.bucket_id === bucketId ? { ...s, target_percent: value } : s)),
    );
  }

  function handleSave() {
    if (!isHundred) {
      toast.error("Total must equal 100%.");
      return;
    }
    startTransition(async () => {
      const result = await saveIndividualAllocations(instructor.id, slate);
      if (result.ok) {
        toast.success("Individual allocations saved");
        onClose();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleReset() {
    startTransition(async () => {
      const result = await resetIndividualAllocations(instructor.id);
      if (result.ok) {
        toast.success("Reset to group/global default");
        onClose();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col overflow-hidden border-l shadow-xl">
          <div className="border-border flex items-start justify-between border-b px-6 py-4">
            <div>
              <Dialog.Title className="text-foreground text-base font-semibold">
                {instructor.full_name}
              </Dialog.Title>
              <Dialog.Description className="text-muted-foreground mt-1 text-xs">
                Currently using <span className="font-medium capitalize">{source}</span>{" "}
                allocations.
                {source !== "individual" && !hasIndividualOverrides && (
                  <> Saving below creates an individual override.</>
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div
              className={`mb-4 flex items-center justify-between rounded-lg border p-3 ${
                isHundred ? "border-border bg-surface" : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div>
                <p className="text-muted-foreground text-xs font-medium">Total</p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  Annual capacity:{" "}
                  <span className="text-foreground tabular-nums">
                    {instructor.annual_hours.toLocaleString()} h/yr
                  </span>
                </p>
              </div>
              <span
                className={`text-lg font-semibold tabular-nums ${
                  isHundred ? "text-foreground" : "text-destructive"
                }`}
              >
                {sum.toFixed(1)}%
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  · {Math.round((instructor.annual_hours * sum) / 100).toLocaleString()} h
                </span>
              </span>
            </div>

            <div className="space-y-2">
              {buckets.map((b) => {
                const v = slate.find((s) => s.bucket_id === b.id)?.target_percent ?? 0;
                return (
                  <SliderRow
                    key={b.id}
                    bucket={b}
                    value={v}
                    annualHoursBase={instructor.annual_hours}
                    onChange={(val) => {
                      setBucketValue(b.id, val);
                    }}
                    disabled={pending}
                  />
                );
              })}
            </div>

            {hasIndividualOverrides && (
              <div className="mt-4">
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      disabled={pending}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline disabled:opacity-50"
                    >
                      <ArrowPathIcon className="h-3.5 w-3.5" />
                      Reset to group/global default
                    </button>
                  }
                  title="Reset overrides?"
                  description="Removes this instructor's individual overrides. They'll fall back to group or global defaults."
                  confirmLabel="Reset"
                  onConfirm={handleReset}
                />
              </div>
            )}
          </div>

          <div className="border-border flex items-center justify-end gap-3 border-t px-6 py-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={!dirty || !isHundred || pending}
              onClick={handleSave}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save individual override"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
