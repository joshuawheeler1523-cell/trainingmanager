"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CommandPalette({ open, onClose }: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-[20vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border shadow-2xl">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>

          <div className="border-border flex items-center gap-3 border-b px-4 py-3">
            <MagnifyingGlassIcon className="text-muted-foreground h-4 w-4 shrink-0" />
            <input
              autoFocus
              aria-label="Search the app"
              placeholder="Search…"
              className="text-foreground placeholder:text-muted-foreground flex-1 bg-transparent text-sm focus:outline-none"
            />
            <kbd className="border-border text-muted-foreground hidden rounded border px-1.5 py-0.5 text-xs sm:block">
              ESC
            </kbd>
          </div>

          <div className="text-muted-foreground px-4 py-8 text-center text-sm">
            Search coming soon — Phase 9.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
