import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Animated placeholder for loading states. Most pages use a Suspense
// fallback like <div className="bg-surface h-64 animate-pulse rounded-lg" />
// inline — this centralizes the recipe and ties it to the theme tokens
// so dark mode looks right.
//
// Three shapes cover almost everything:
//   - Skeleton (rectangle, full width by default; pass className to size)
//   - SkeletonLine (single text line)
//   - SkeletonStack (N lines with varying widths to mimic a paragraph)

type Props = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...rest }: Props) {
  return (
    <div aria-hidden className={cn("bg-surface animate-pulse rounded-md", className)} {...rest} />
  );
}

export function SkeletonLine({ className, ...rest }: Props) {
  return <Skeleton className={cn("h-3.5 w-full", className)} {...rest} />;
}

export function SkeletonStack({ lines = 3, className }: { lines?: number; className?: string }) {
  // Vary widths so the placeholder doesn't look like a flat block.
  const widths = ["w-full", "w-11/12", "w-4/5", "w-3/4", "w-2/3"];
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn("bg-surface h-3.5 animate-pulse rounded-md", widths[i % widths.length])}
        />
      ))}
    </div>
  );
}
