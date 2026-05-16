import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Status pills in the editorial design system: muted tinted backgrounds,
// JetBrains Mono uppercase text, tight tracking. Used everywhere to
// communicate state without shouting.

export type BadgeVariant =
  | "default"
  | "success" // balanced / on-track / approved
  | "warning" // at-risk / in-progress
  | "danger" // over-allocated / failed / conflict
  | "info" // informational / agency-managed
  | "neutral" // under-utilized / archived
  | "accent"; // persimmon callout — first-class new entity

const VARIANT: Record<BadgeVariant, string> = {
  // Default keeps a hair border for cases where there's no semantic state.
  default: "bg-surface text-foreground border-border border",
  // Forest tint — balanced / on-track.
  success: "bg-[rgba(59,122,68,0.10)] text-[var(--green)]",
  // Persimmon tint — at-risk / in-progress.
  warning: "bg-[rgba(201,138,58,0.14)] text-[var(--persimmon-deep)]",
  // Red tint — over-allocated / conflict / failed.
  danger: "bg-[rgba(183,61,61,0.12)] text-[var(--red)]",
  // Forest fill — informational. Soft brand presence.
  info: "bg-[rgba(45,74,46,0.10)] text-[var(--forest)]",
  // Sage tint — under-utilized / muted.
  neutral: "bg-[rgba(139,157,131,0.18)] text-[#5a6855]",
  // Persimmon solid — accent / new entity callout.
  accent: "bg-[var(--persimmon)] text-[var(--ink)]",
};

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children: ReactNode;
};

export function Badge({ variant = "default", className, children, ...rest }: Props) {
  return (
    <span
      className={cn(
        // Mono uppercase with tracking. 3px radius is the editorial pill
        // shape (not rounded-full). ~10px font with letter-spacing.
        "inline-flex items-center rounded-[3px] px-[7px] py-[3px] font-mono text-[10px] font-medium uppercase leading-none tracking-[0.05em]",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
