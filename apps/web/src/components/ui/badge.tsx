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

// Text colors are intentionally darker than the raw status tokens so the small
// mono pill text clears WCAG AA (≥4.5:1) on each muted tint. Backgrounds keep
// the editorial muted look; only the foreground was deepened for legibility.
const VARIANT: Record<BadgeVariant, string> = {
  // Default keeps a hair border for cases where there's no semantic state.
  default: "bg-surface text-foreground border-border border",
  // Forest tint — balanced / on-track.
  success: "bg-[rgba(59,122,68,0.10)] text-[#2a6334]",
  // Persimmon tint — at-risk / in-progress.
  warning: "bg-[rgba(201,138,58,0.14)] text-[#8a5316]",
  // Red tint — over-allocated / conflict / failed.
  danger: "bg-[rgba(183,61,61,0.12)] text-[#a02c2c]",
  // Forest fill — informational. Soft brand presence.
  info: "bg-[rgba(45,74,46,0.10)] text-[#2d4a2e]",
  // Sage tint — under-utilized / muted.
  neutral: "bg-[rgba(139,157,131,0.18)] text-[#4d5746]",
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
