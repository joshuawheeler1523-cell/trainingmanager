"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  XMarkIcon,
  UserPlusIcon,
} from "@heroicons/react/20/solid";
import GroupFormDialog from "./group-form-dialog";
import SliderRow from "./slider-row";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useLabel } from "@/components/labels";
import { addGroupMember, removeGroupMember, saveGroupAllocations, deleteGroup } from "./actions";
import { sumSlate } from "@arbor/shared";
import type {
  AllocationBucket,
  AllocationGroup,
  AllocationGroupMember,
  GroupAllocation,
  Instructor,
} from "@arbor/shared";

type Props = {
  buckets: AllocationBucket[];
  groups: AllocationGroup[];
  members: AllocationGroupMember[];
  groupAllocations: GroupAllocation[];
  instructors: Instructor[];
};

export default function GroupsTab({
  buckets,
  groups,
  members,
  groupAllocations,
  instructors,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.id ?? null);

  // Reselect first group if the selected one was deleted (after refresh).
  useEffect(() => {
    if (selectedId && !groups.some((g) => g.id === selectedId)) {
      setSelectedId(groups[0]?.id ?? null);
    }
  }, [groups, selectedId]);

  const activeBuckets = useMemo(
    () =>
      [...buckets.filter((b) => !b.is_archived)].sort((a, b) => a.display_order - b.display_order),
    [buckets],
  );

  // member counts per instructor (for the multi-group badge)
  const memberGroupCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of members) {
      m.set(row.instructor_id, (m.get(row.instructor_id) ?? 0) + 1);
    }
    return m;
  }, [members]);

  // member counts per group (for the rail)
  const groupMemberCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of members) {
      m.set(row.group_id, (m.get(row.group_id) ?? 0) + 1);
    }
    return m;
  }, [members]);

  const selectedGroup = groups.find((g) => g.id === selectedId) ?? null;

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            No allocation groups yet. Create one to override the global defaults for a subset of
            instructors.
          </p>
          <div className="mt-4 flex justify-center">
            <GroupFormDialog
              mode="create"
              trigger={
                <button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create group
                </button>
              }
              onSuccess={() => {
                router.refresh();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      {/* Left rail */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-semibold">Groups</h3>
          <GroupFormDialog
            mode="create"
            trigger={
              <button
                type="button"
                className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New
              </button>
            }
            onSuccess={(g) => {
              setSelectedId(g.id);
              router.refresh();
            }}
          />
        </div>
        <ul className="border-border bg-background overflow-hidden rounded-xl border">
          {groups.map((g) => {
            const count = groupMemberCount.get(g.id) ?? 0;
            const active = g.id === selectedId;
            return (
              <li key={g.id} className="border-border border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(g.id);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-surface text-foreground"
                  }`}
                >
                  <span className="truncate">{g.name}</span>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-1.5 text-xs tabular-nums ${
                      active ? "bg-primary/20 text-primary" : "bg-surface text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Right pane */}
      {selectedGroup ? (
        <GroupDetail
          group={selectedGroup}
          buckets={activeBuckets}
          members={members.filter((m) => m.group_id === selectedGroup.id)}
          groupAllocations={groupAllocations.filter((ga) => ga.group_id === selectedGroup.id)}
          instructors={instructors}
          memberGroupCount={memberGroupCount}
        />
      ) : null}
    </div>
  );
}

function GroupDetail({
  group,
  buckets,
  members,
  groupAllocations,
  instructors,
  memberGroupCount,
}: {
  group: AllocationGroup;
  buckets: AllocationBucket[];
  members: AllocationGroupMember[];
  groupAllocations: GroupAllocation[];
  instructors: Instructor[];
  memberGroupCount: Map<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onChanged = () => {
    router.refresh();
  };
  const [memberSearch, setMemberSearch] = useState("");
  const [pickToAdd, setPickToAdd] = useState("");
  const instructorPlural = useLabel("entity.instructor", { plural: true, lower: true });
  const instructorLower = useLabel("entity.instructor", { lower: true });

  const initialSlate = useMemo(() => {
    const byBucket = new Map(groupAllocations.map((g) => [g.bucket_id, g.target_percent]));
    return buckets.map((b) => ({
      bucket_id: b.id,
      target_percent: byBucket.get(b.id) ?? 0,
    }));
  }, [buckets, groupAllocations]);

  const [slate, setSlate] = useState(initialSlate);

  // Re-init slate when the selected group changes or server data updates.
  useEffect(() => {
    setSlate(initialSlate);
  }, [initialSlate]);

  const dirty = slate.some(
    (s, i) => initialSlate[i] === undefined || s.target_percent !== initialSlate[i].target_percent,
  );
  const { sum, isHundred } = sumSlate(slate);

  const memberIds = new Set(members.map((m) => m.instructor_id));
  const memberInstructors = instructors
    .filter((i) => memberIds.has(i.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const available = instructors
    .filter((i) => !memberIds.has(i.id) && i.deleted_at === null)
    .filter((i) =>
      memberSearch ? i.full_name.toLowerCase().includes(memberSearch.toLowerCase()) : true,
    )
    .slice(0, 50);

  function setBucketValue(bucketId: string, value: number) {
    setSlate((prev) =>
      prev.map((s) => (s.bucket_id === bucketId ? { ...s, target_percent: value } : s)),
    );
  }

  function handleAddMember() {
    if (!pickToAdd) return;
    startTransition(async () => {
      const result = await addGroupMember(group.id, pickToAdd);
      if (result.ok) {
        toast.success("Member added");
        setPickToAdd("");
        setMemberSearch("");
        onChanged();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemoveMember(instructorId: string) {
    startTransition(async () => {
      const result = await removeGroupMember(group.id, instructorId);
      if (result.ok) {
        toast.success("Member removed");
        onChanged();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleSaveAllocations() {
    if (!isHundred) {
      toast.error("Total must equal 100%.");
      return;
    }
    startTransition(async () => {
      const result = await saveGroupAllocations(group.id, slate);
      if (result.ok) {
        toast.success("Group allocations saved");
        onChanged();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDeleteGroup() {
    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if (result.ok) {
        toast.success("Group deleted");
        onChanged();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-foreground text-base font-semibold">{group.name}</h3>
          {group.description && (
            <p className="text-muted-foreground mt-1 text-sm">{group.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GroupFormDialog
            mode="edit"
            group={group}
            trigger={
              <button
                type="button"
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs"
              >
                <PencilSquareIcon className="h-3.5 w-3.5" />
                Edit
              </button>
            }
            onSuccess={onChanged}
          />
          <ConfirmDialog
            trigger={
              <button
                type="button"
                disabled={pending}
                className="border-border text-destructive hover:bg-surface inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs disabled:opacity-50"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete group
              </button>
            }
            title="Delete group?"
            description="Members fall back to global defaults (or other groups they belong to). This cannot be undone."
            confirmLabel="Delete"
            destructive
            onConfirm={handleDeleteGroup}
          />
        </div>
      </div>

      {/* Members */}
      <section className="border-border bg-background space-y-3 rounded-xl border p-4">
        <h4 className="text-foreground text-sm font-semibold">
          Members ({memberInstructors.length})
        </h4>

        {/* Add member row */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label={`Search ${instructorPlural} to add`}
            placeholder={`Search ${instructorPlural}…`}
            value={memberSearch}
            onChange={(e) => {
              setMemberSearch(e.target.value);
            }}
            className="border-input bg-background text-foreground focus:ring-ring flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
          />
          <select
            value={pickToAdd}
            onChange={(e) => {
              setPickToAdd(e.target.value);
            }}
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">Pick {instructorLower}…</option>
            {available.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickToAdd || pending}
            onClick={handleAddMember}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <UserPlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>

        {memberInstructors.length === 0 ? (
          <p className="text-muted-foreground text-sm">No members yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {memberInstructors.map((i) => {
              const otherGroupCount = (memberGroupCount.get(i.id) ?? 1) - 1;
              return (
                <li
                  key={i.id}
                  className="border-border bg-surface flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                >
                  <span className="text-foreground flex items-center gap-2">
                    {i.full_name}
                    {otherGroupCount > 0 && (
                      <span
                        className="bg-primary/10 text-primary rounded-full px-1.5 text-xs font-medium"
                        title={`Also in ${String(otherGroupCount)} other group${otherGroupCount === 1 ? "" : "s"}`}
                      >
                        +{otherGroupCount}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      handleRemoveMember(i.id);
                    }}
                    aria-label={`Remove ${i.full_name}`}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Allocations */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-foreground text-sm font-semibold">Bucket allocations</h4>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Hours shown per 2,080 h/yr FTE — actual member hours scale proportionally.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              isHundred ? "bg-surface text-foreground" : "bg-destructive/10 text-destructive"
            }`}
          >
            {sum.toFixed(1)}% · {Math.round((2080 * sum) / 100).toLocaleString()} h/yr
          </span>
        </div>
        {buckets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Add buckets first.</p>
        ) : (
          <>
            <div className="space-y-2">
              {buckets.map((b) => {
                const v = slate.find((s) => s.bucket_id === b.id)?.target_percent ?? 0;
                return (
                  <SliderRow
                    key={b.id}
                    bucket={b}
                    value={v}
                    annualHoursBase={2080}
                    onChange={(val) => {
                      setBucketValue(b.id, val);
                    }}
                    disabled={pending}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={!dirty || pending}
                onClick={() => {
                  setSlate(initialSlate);
                }}
                className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={!dirty || !isHundred || pending}
                onClick={handleSaveAllocations}
                className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save group allocations"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
