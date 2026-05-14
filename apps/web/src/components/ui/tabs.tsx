"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The tab strip recipe (border-b nav + underline-when-active button) is
// reimplemented in /skills, /allocations, /instructors, /classes, and
// most detail pages. This consolidates it into one component without
// taking on the size/dep cost of a headless-ui or radix tabs.
//
// `value` + `onChange` make the component controlled; pass them when the
// parent needs to react to tab changes (e.g., for URL syncing). Otherwise
// pass `defaultValue` to keep internal state.

export type TabItem<T extends string = string> = {
  id: T;
  label: ReactNode;
};

type Props<T extends string = string> = {
  tabs: TabItem<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (id: T) => void;
  className?: string;
  /** Padding on the strip's container; defaults to `px-6` to match page padding. */
  paddingX?: string;
};

export function Tabs<T extends string = string>({
  tabs,
  value,
  defaultValue,
  onChange,
  className,
  paddingX = "px-6",
}: Props<T>) {
  const [internal, setInternal] = useState<T>(defaultValue ?? tabs[0]?.id ?? ("" as T));
  const active = value ?? internal;

  function handleClick(id: T) {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  }

  return (
    <div className={cn("border-border bg-background border-b", paddingX, className)}>
      <nav className="-mb-px flex gap-6 overflow-x-auto" role="tablist">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                handleClick(t.id);
              }}
              className={cn(
                "shrink-0 border-b-2 pb-3 pt-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
