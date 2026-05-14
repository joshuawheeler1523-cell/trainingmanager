import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Single source of truth for the platform's buttons. Five variants and two
// sizes cover ~95% of usage; the `className` prop is still accepted for the
// edge cases. Icon-only buttons should use `iconOnly` so they get square
// padding instead of rectangular.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 border border-transparent",
  secondary:
    "border-border bg-background text-foreground hover:bg-surface disabled:opacity-50 border",
  ghost:
    "text-muted-foreground hover:text-foreground hover:bg-surface disabled:opacity-50 border border-transparent",
  destructive:
    "border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50 border",
  link: "text-primary hover:underline underline-offset-2 p-0 border-0 bg-transparent disabled:opacity-50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs gap-1",
  md: "h-9 px-3 text-sm gap-1.5",
};

const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 w-7 p-0",
  md: "h-9 w-9 p-0",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  /** Optional leading icon. Ignored when `iconOnly` is true. */
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", iconOnly = false, icon, className, children, type, ...rest },
  ref,
) {
  const sizing = iconOnly ? ICON_ONLY_SIZE[size] : SIZE[size];
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "focus:ring-ring inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed",
        VARIANT[variant],
        variant !== "link" && sizing,
        className,
      )}
      {...rest}
    >
      {!iconOnly && icon}
      {children}
    </button>
  );
});
