import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Single source of truth for the platform's buttons. Editorial styling:
// ink background + cream text for primary (not the brand-forest — forest
// is reserved for emphasis text and link affordances). Secondary is
// transparent with a hair border. Ghost is text-only.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-canvas hover:bg-black border border-transparent disabled:opacity-50",
  secondary:
    "border-border bg-transparent text-foreground hover:bg-surface hover:border-foreground border disabled:opacity-50",
  ghost:
    "text-foreground hover:text-primary border border-transparent bg-transparent disabled:opacity-50",
  destructive:
    "border-destructive/40 text-destructive hover:bg-destructive/10 border bg-transparent disabled:opacity-50",
  link: "text-primary hover:underline underline-offset-2 p-0 border-0 bg-transparent disabled:opacity-50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs gap-1",
  md: "h-9 px-4 text-sm gap-1.5",
  lg: "h-11 px-5 text-[15px] gap-2",
};

const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 w-7 p-0",
  md: "h-9 w-9 p-0",
  lg: "h-11 w-11 p-0",
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
        // 6px radius matches the editorial spec; Geist font weight 500.
        "focus:ring-ring/30 inline-flex items-center justify-center rounded-md font-medium leading-none transition-colors duration-150 focus:outline-none focus:ring-[3px] disabled:cursor-not-allowed",
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
