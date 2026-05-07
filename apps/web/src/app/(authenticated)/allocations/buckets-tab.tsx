"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PencilSquareIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  PlusIcon,
  Bars3Icon,
} from "@heroicons/react/20/solid";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import BucketFormDialog from "./bucket-form-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { archiveBucket, unarchiveBucket, reorderBuckets } from "./actions";
import type { AllocationBucket } from "@arbor/shared";

type Props = {
  buckets: AllocationBucket[];
};

function SortableRow({
  bucket,
  pending,
  onArchive,
  onRestore,
  onEdited,
}: {
  bucket: AllocationBucket;
  pending: boolean;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onEdited: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bucket.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-surface ${bucket.is_archived ? "opacity-60" : ""}`}
    >
      <td className="w-8 px-2 py-3 text-center">
        {!bucket.is_archived && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
            aria-label={`Drag to reorder ${bucket.name}`}
          >
            <Bars3Icon className="h-4 w-4" />
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: bucket.color }}
            aria-hidden
          />
          <span className="text-foreground text-sm font-medium">{bucket.name}</span>
        </div>
      </td>
      <td className="text-muted-foreground px-4 py-3 text-xs">{bucket.description ?? "—"}</td>
      <td className="text-muted-foreground px-4 py-3 text-xs tabular-nums">
        {bucket.display_order}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <BucketFormDialog
            mode="edit"
            bucket={bucket}
            trigger={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
              >
                <PencilSquareIcon className="h-3.5 w-3.5" />
                Edit
              </button>
            }
            onSuccess={onEdited}
          />
          {bucket.is_archived ? (
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  disabled={pending}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs disabled:opacity-50"
                >
                  <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                  Restore
                </button>
              }
              title="Restore bucket?"
              description="This bucket will be selectable again across allocations."
              confirmLabel="Restore"
              onConfirm={() => {
                onRestore(bucket.id);
              }}
            />
          ) : (
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  disabled={pending}
                  className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                >
                  <ArchiveBoxIcon className="h-3.5 w-3.5" />
                  Archive
                </button>
              }
              title="Archive bucket?"
              description="The bucket will be hidden, but existing allocation rows for it remain. You can restore later."
              confirmLabel="Archive"
              destructive
              onConfirm={() => {
                onArchive(bucket.id);
              }}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

export default function BucketsTab({ buckets }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);

  const sortedActive = useMemo(
    () =>
      [...buckets.filter((b) => !b.is_archived)].sort((a, b) => a.display_order - b.display_order),
    [buckets],
  );
  const archived = useMemo(() => buckets.filter((b) => b.is_archived), [buckets]);

  // Optimistic reordering: when the user drags, we re-sort the list immediately
  // while the server action runs in the background.
  const [orderedActive, setOrderedActive] = useOptimistic<AllocationBucket[], AllocationBucket[]>(
    sortedActive,
    (_state, next) => next,
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedActive.findIndex((b) => b.id === active.id);
    const newIndex = orderedActive.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(orderedActive, oldIndex, newIndex);

    startTransition(async () => {
      setOrderedActive(next);
      const payload = next.map((b, i) => ({ id: b.id, display_order: i }));
      const result = await reorderBuckets(payload);
      if (!result.ok) {
        toast.error(result.error.message);
      }
      router.refresh();
    });
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      const result = await archiveBucket(id);
      if (result.ok) {
        toast.success("Bucket archived");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRestore(id: string) {
    startTransition(async () => {
      const result = await unarchiveBucket(id);
      if (result.ok) {
        toast.success("Bucket restored");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
            }}
            className="border-border h-3.5 w-3.5 rounded"
          />
          Show archived ({archived.length})
        </label>
        <BucketFormDialog
          mode="create"
          trigger={
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              Add bucket
            </button>
          }
          onSuccess={() => {
            router.refresh();
          }}
        />
      </div>

      {(showArchived ? archived : orderedActive).length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {showArchived
              ? "No archived buckets."
              : "No buckets yet — add your first allocation bucket."}
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="w-8 px-2 py-2.5" />
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Name
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Description
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Order
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {showArchived ? (
                archived.map((b) => (
                  <SortableRow
                    key={b.id}
                    bucket={b}
                    pending={pending}
                    onArchive={handleArchive}
                    onRestore={handleRestore}
                    onEdited={() => {
                      router.refresh();
                    }}
                  />
                ))
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={orderedActive.map((b) => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {orderedActive.map((b) => (
                      <SortableRow
                        key={b.id}
                        bucket={b}
                        pending={pending}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onEdited={() => {
                          router.refresh();
                        }}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
