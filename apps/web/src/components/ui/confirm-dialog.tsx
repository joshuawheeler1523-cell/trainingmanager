"use client";

import * as Dialog from "@radix-ui/react-dialog";

type Props = {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export default function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-6 shadow-xl">
          <Dialog.Title className="text-foreground text-base font-semibold">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="text-muted-foreground mt-2 text-sm">
              {description}
            </Dialog.Description>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium">
                {cancelLabel}
              </button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                onClick={() => {
                  void onConfirm();
                }}
                className={
                  destructive
                    ? "bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
                    : "bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
                }
              >
                {confirmLabel}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
