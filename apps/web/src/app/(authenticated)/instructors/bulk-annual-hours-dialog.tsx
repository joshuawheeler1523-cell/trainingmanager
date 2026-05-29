"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { bulkSetAnnualHours } from "./actions";

type Props = {
  trigger: React.ReactNode;
  instructorCount: number;
};

export default function BulkAnnualHoursDialog({ trigger, instructorCount }: Props) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("1880");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setHours("1880");
    setConfirming(false);
  }

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) reset();
  }

  function handleApply() {
    startTransition(async () => {
      const result = await bulkSetAnnualHours({ annual_hours: Number(hours) });
      if (result.ok) {
        toast.success(
          `Set annual hours to ${hours} on ${result.data.updated.toString()} instructor${
            result.data.updated === 1 ? "" : "s"
          }`,
        );
        setOpen(false);
        reset();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const parsed = Number(hours);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 4000;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="border-border bg-background fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-xl">
          <div className="border-border border-b px-5 py-4">
            <Dialog.Title className="text-foreground text-base font-semibold">
              Apply annual hours to all instructors
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground mt-1 text-xs">
              Sets the same annual capacity on every active instructor. Overwrites any custom
              values.
            </Dialog.Description>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div>
              <label
                htmlFor="bulk-annual-hours"
                className="text-foreground mb-1 block text-sm font-medium"
              >
                Annual hours
              </label>
              <input
                id="bulk-annual-hours"
                type="number"
                min={0}
                max={4000}
                step={1}
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  setConfirming(false);
                }}
                disabled={pending}
                className="border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Integer 0–4000. Default 1880 (52 weeks × ~36 h/wk).
              </p>
            </div>

            {confirming && (
              <div className="border-border rounded-md border bg-amber-50/60 p-3 text-xs dark:bg-amber-950/20">
                <p className="text-foreground font-medium">
                  This will overwrite annual hours on {instructorCount.toString()} instructor
                  {instructorCount === 1 ? "" : "s"}.
                </p>
                <p className="text-muted-foreground mt-1">
                  Any custom values currently set will be replaced. Archived instructors are not
                  affected.
                </p>
              </div>
            )}
          </div>

          <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
            <button
              type="button"
              onClick={() => {
                handleOpenChange(false);
              }}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            {confirming ? (
              <button
                type="button"
                onClick={handleApply}
                disabled={pending || !valid}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                {pending ? "Applying…" : `Yes, apply to ${instructorCount.toString()}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirming(true);
                }}
                disabled={!valid}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Continue
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
