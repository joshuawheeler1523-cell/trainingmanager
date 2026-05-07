"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { XMarkIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function HelpDrawer({ open, onClose }: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="border-border bg-background data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l shadow-xl">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="text-foreground flex items-center gap-2 text-sm font-semibold">
              <QuestionMarkCircleIcon className="h-4 w-4" />
              Help
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
                aria-label="Close help"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6">
            <p className="text-muted-foreground text-sm">
              Contextual help and search are coming in Phase 9.
            </p>

            <div className="mt-6 space-y-3">
              <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                Keyboard shortcuts
              </h3>
              <div className="space-y-2 text-sm">
                {[
                  { keys: "⌘K", label: "Open search" },
                  { keys: "?", label: "Open help" },
                  { keys: "⌘S", label: "Save (when form is focused)" },
                ].map(({ keys, label }) => (
                  <div key={keys} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <kbd className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
