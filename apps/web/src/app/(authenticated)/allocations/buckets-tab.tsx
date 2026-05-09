"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import {
  PencilSquareIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  PlusIcon,
  Bars3Icon,
  SparklesIcon,
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
import { applyBucketTemplate, archiveBucket, unarchiveBucket, reorderBuckets } from "./actions";
import { BUCKET_TEMPLATES, type BucketTemplate } from "./templates";
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

  function handleApplyTemplate(template: BucketTemplate) {
    startTransition(async () => {
      const result = await applyBucketTemplate(template.id);
      if (result.ok) {
        toast.success(`${template.label} applied`, {
          description: `Created ${String(result.data.created)} buckets with default percentages.`,
        });
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const hasActive = orderedActive.length > 0;

  return (
    <div className="space-y-4">
      {/* Empty-state template picker — prominent when there are no buckets
          yet, since picking a template is the natural way to start. */}
      {!hasActive && !showArchived && (
        <TemplateGallery onApply={handleApplyTemplate} pending={pending} />
      )}

      <div className="flex items-center justify-between gap-2">
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
        <div className="flex items-center gap-2">
          {hasActive && <TemplatePickerDialog onApply={handleApplyTemplate} pending={pending} />}
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
      </div>

      {(showArchived ? archived : orderedActive).length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {showArchived
              ? "No archived buckets."
              : "Pick a template above or add a bucket manually."}
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

// ── Template UI ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  pending,
  onApply,
  variant,
}: {
  template: BucketTemplate;
  pending: boolean;
  onApply: (t: BucketTemplate) => void;
  variant: "gallery" | "dialog";
}) {
  return (
    <div
      className={`border-border ${variant === "gallery" ? "bg-background" : "bg-surface"} rounded-lg border p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">{template.label}</p>
          <p className="text-muted-foreground mt-1 text-xs">{template.description}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            onApply(template);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Use this
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {template.buckets.map((b) => (
          <span
            key={b.name}
            className="border-border bg-background inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: b.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{b.name}</span>
            <span className="text-foreground font-semibold tabular-nums">{b.percent}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TemplateGallery({
  onApply,
  pending,
}: {
  onApply: (t: BucketTemplate) => void;
  pending: boolean;
}) {
  return (
    <section className="border-border bg-background rounded-xl border p-5">
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-5 w-5" style={{ color: "var(--highlight)" }} />
        <h3 className="text-foreground text-base font-semibold">Start with a template</h3>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        Industry-benchmark presets for healthcare education teams. Picking one creates the bucket
        slate and sets default percentages — you can edit, archive, or add to it afterward.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {BUCKET_TEMPLATES.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            pending={pending}
            onApply={onApply}
            variant="gallery"
          />
        ))}
      </div>
    </section>
  );
}

function TemplatePickerDialog({
  onApply,
  pending,
}: {
  onApply: (t: BucketTemplate) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<BucketTemplate | null>(null);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <SparklesIcon className="h-4 w-4" style={{ color: "var(--highlight)" }} />
            Apply template
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
            <Dialog.Title className="text-foreground text-base font-semibold">
              Apply a template
            </Dialog.Title>
            <Dialog.Description className="text-destructive mt-1 text-xs">
              Heads up: applying a template archives all of your current active buckets and replaces
              them with the template&apos;s slate. Existing allocation rows stay intact against the
              archived buckets.
            </Dialog.Description>
            <ul className="mt-4 space-y-3">
              {BUCKET_TEMPLATES.map((t) => (
                <li key={t.id}>
                  <TemplateCard
                    template={t}
                    pending={pending}
                    onApply={(tt) => {
                      setPendingTemplate(tt);
                    }}
                    variant="dialog"
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium"
                >
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={pendingTemplate != null}
        onOpenChange={(v) => {
          if (!v) setPendingTemplate(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
            <Dialog.Title className="text-foreground text-base font-semibold">
              Apply {pendingTemplate?.label ?? "template"}?
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground mt-2 text-sm">
              Your current active buckets will be archived. The template will create{" "}
              {String(pendingTemplate?.buckets.length ?? 0)} new buckets and reset global allocation
              percentages. Allocation rows pointing at archived buckets stay valid for historical
              reads.
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPendingTemplate(null);
                }}
                className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (pendingTemplate) {
                    onApply(pendingTemplate);
                    setPendingTemplate(null);
                    setOpen(false);
                  }
                }}
                className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
