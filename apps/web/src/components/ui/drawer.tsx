"use client";

import { useEffect, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { cn } from "@/lib/utils";

// Right-edge drawer with backdrop. The sketchpad session drawer, the
// project task drawer, and a few smaller panels each reimplement this
// pattern with subtle drift (different widths, different close
// behaviors). Centralizing keeps Esc / backdrop-click consistent and
// gives one place to fix the keyboard focus ring later.

export type DrawerSize = "sm" | "md" | "lg";

const SIZE: Record<DrawerSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: DrawerSize;
  children: ReactNode;
  /** Optional content rendered to the right of the close button. */
  headerActions?: ReactNode;
};

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  headerActions,
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
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "border-border bg-background flex w-full flex-col border-l shadow-xl",
          SIZE[size],
        )}
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        {(title || subtitle || headerActions) && (
          <div className="border-border flex items-start justify-between gap-3 border-b px-6 py-4">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 className="text-foreground truncate text-base font-semibold">{title}</h2>
              )}
              {subtitle && <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-1">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground rounded p-1"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
