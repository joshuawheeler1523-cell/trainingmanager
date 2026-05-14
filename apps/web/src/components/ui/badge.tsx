import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Status pills used everywhere — green for active / ok, amber for tight,
// rose for over / failed, slate for neutral, violet for "pool" or
// "agency-managed" callouts. The shape (rounded-full, tiny tracked text)
// is the same across the app; only the color recipe varies.

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const VARIANT: Record<BadgeVariant, string> = {
  default: "bg-surface text-foreground border-border border",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
  info: "bg-primary/10 text-primary",
  neutral: "bg-surface text-muted-foreground",
};

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children: ReactNode;
};

export function Badge({ variant = "default", className, children, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
