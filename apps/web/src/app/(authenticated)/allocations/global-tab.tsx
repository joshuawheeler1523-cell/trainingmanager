"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import SliderRow from "./slider-row";
import { saveGlobalAllocations } from "./actions";
import { sumSlate } from "@arbor/shared";
import type { AllocationBucket, GlobalAllocation } from "@arbor/shared";

type Props = {
  buckets: AllocationBucket[];
  globals: GlobalAllocation[];
  // Count of instructors who'd be affected if globals change (i.e., have no
  // individual override and aren't members of any group with a group_allocation).
  defaultUserCount: number;
};

export default function GlobalTab({ buckets, globals, defaultUserCount }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activeBuckets = useMemo(
    () =>
      [...buckets.filter((b) => !b.is_archived)].sort((a, b) => a.display_order - b.display_order),
    [buckets],
  );

  // Initial slate: existing globals merged with active buckets (default 0 for new buckets).
  const initialSlate = useMemo(() => {
    const byBucket = new Map(globals.map((g) => [g.bucket_id, g.target_percent]));
    return activeBuckets.map((b) => ({
      bucket_id: b.id,
      target_percent: byBucket.get(b.id) ?? 0,
    }));
  }, [activeBuckets, globals]);

  const [slate, setSlate] = useState(initialSlate);

  const dirty = useMemo(
    () =>
      slate.some(
        (s, i) =>
          initialSlate[i] === undefined || s.target_percent !== initialSlate[i].target_percent,
      ),
    [slate, initialSlate],
  );

  const { sum, isHundred } = sumSlate(slate);

  function setBucketValue(bucketId: string, value: number) {
    setSlate((prev) =>
      prev.map((s) => (s.bucket_id === bucketId ? { ...s, target_percent: value } : s)),
    );
  }

  function attemptSave() {
    if (!isHundred) {
      toast.error("Total must equal 100%.");
      return;
    }
    if (defaultUserCount > 0) {
      setConfirmOpen(true);
    } else {
      doSave();
    }
  }

  function doSave() {
    startTransition(async () => {
      const result = await saveGlobalAllocations(slate);
      if (result.ok) {
        toast.success("Global defaults saved");
        setConfirmOpen(false);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  if (activeBuckets.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          Add allocation buckets first, then set the org-wide default percentages here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live total */}
      <div
        className={`flex items-center justify-between rounded-xl border p-4 ${
          isHundred ? "border-border bg-background" : "border-destructive/40 bg-destructive/5"
        }`}
      >
        <div>
          <p className="text-muted-foreground text-xs font-medium">Total</p>
          <p
            className={`mt-0.5 text-2xl font-semibold tabular-nums ${
              isHundred ? "text-foreground" : "text-destructive"
            }`}
          >
            {sum.toFixed(1)}%
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              · {Math.round((2080 * sum) / 100).toLocaleString()} h/yr per FTE
            </span>
          </p>
        </div>
        <div className="text-muted-foreground text-xs">
          {isHundred ? (
            "Sums to 100%"
          ) : (
            <span className="text-destructive">Must equal 100% to save</span>
          )}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Hours shown are based on a 2,080 h/yr full-time schedule. Instructors with different annual
        hours scale proportionally.
      </p>

      <div className="space-y-2">
        {activeBuckets.map((b) => {
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
          className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={!dirty || !isHundred || pending}
          onClick={attemptSave}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save defaults"}
        </button>
      </div>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
            <Dialog.Title className="text-foreground text-base font-semibold">
              Update global defaults?
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground mt-2 text-sm">
              {defaultUserCount} instructor{defaultUserCount === 1 ? "" : "s"} currently use these
              defaults (no group or individual overrides). Their effective allocations will change
              immediately.
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-3">
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
                disabled={pending}
                onClick={doSave}
                className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Confirm save"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
