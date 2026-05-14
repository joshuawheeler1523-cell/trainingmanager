"use client";

import { useEffect, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";

// Centered modal dialog with backdrop. Replaces the `fixed inset-0 z-50
// flex items-center justify-center bg-black/40 p-4` recipe repeated in
// every paste/help/auto-schedule dialog. Esc closes; clicking the
// backdrop closes; focus is left to the caller (most dialogs auto-focus
// their primary input).
//
// Use `size` to constrain max-width. Larger forms want `lg` or `xl`;
// confirmations want `sm`.

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  children: ReactNode;
  /** Footer content (typically Cancel + Save buttons). Optional. */
  footer?: ReactNode;
  /** Suppress the default close (×) button in the header. */
  hideCloseButton?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  hideCloseButton = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "border-border bg-background flex max-h-[90vh] w-full flex-col gap-3 rounded-lg border p-5 shadow-xl",
          SIZE[size],
        )}
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-foreground text-base font-semibold">{title}</h2>}
              {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 rounded p-1"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </div>
  );
}
