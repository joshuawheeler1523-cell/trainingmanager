import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// The "border-border bg-background rounded-lg border p-X" recipe that's
// repeated 30+ times across the app. Variants:
//   - default: white-on-white, the standard panel
//   - muted: bg-surface, used inside another card or for secondary content
//   - dashed: dashed border, for empty / placeholder areas
//
// Padding is opt-in via `padded` (default true) since some layouts want
// the card edge-to-edge for tables.

export type CardVariant = "default" | "muted" | "dashed";

const VARIANT: Record<CardVariant, string> = {
  default: "border-border bg-background border",
  muted: "border-border bg-surface border",
  dashed: "border-border bg-surface border border-dashed",
};

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padded?: boolean;
};

export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { variant = "default", padded = true, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("rounded-lg", VARIANT[variant], padded && "p-4", className)}
      {...rest}
    >
      {children}
    </div>
  );
});
