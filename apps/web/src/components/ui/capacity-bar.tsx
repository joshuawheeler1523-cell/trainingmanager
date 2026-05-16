import { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

// The 5-segment stacked capacity bar from the editorial design system.
// The bar's full width represents 120% of capacity; the 100% target line
// sits at 83.333% across, so anything past that visually reads as
// "over." Segments are bucket-colored slices that sum to the actual
// utilization percentage. An optional `overage` value paints the
// red diagonal-stripe pattern past the 100% line.
//
// Used in the Allocations summary roster and in the per-bucket
// consumption visualization. Pure presentation — feed it pre-aggregated
// percentages.

export type CapacitySegment = {
  /** Percentage of the bar's full 120% width this segment occupies. */
  percent: number;
  /** CSS color string (hex, rgb, var()). */
  color: string;
  /** Optional label for accessibility. */
  label?: string;
};

type Props = {
  segments: CapacitySegment[];
  /** Whether to render the 100% target marker at 83.333%. Default true. */
  showTarget?: boolean;
  /** If set, renders the red diagonal-stripe overage region from 83.333%
   *  forward for this many percentage points (capped at remaining width). */
  overagePercent?: number;
  className?: string;
};

// Bar is scaled so 120% utilization fills it; 100% sits at 83.333%.
const SCALE = 120;
const TARGET_AT = (100 / SCALE) * 100; // = 83.333

export function CapacityBar({ segments, showTarget = true, overagePercent = 0, className }: Props) {
  const overageStyle: CSSProperties =
    overagePercent > 0
      ? {
          left: `${TARGET_AT.toString()}%`,
          width: `${Math.min(overagePercent, SCALE - 100).toString()}%`,
        }
      : { display: "none" };

  return (
    <div
      className={cn(
        "relative h-4 overflow-hidden rounded-[3px] bg-[rgba(28,31,28,0.04)]",
        className,
      )}
    >
      <div className="absolute inset-0 flex">
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-full border-r border-white/55 last:border-r-0"
            style={{ width: `${((s.percent / SCALE) * 100).toString()}%`, background: s.color }}
            aria-label={s.label}
          />
        ))}
      </div>
      {overagePercent > 0 && (
        <div
          className="absolute inset-y-0"
          style={{
            ...overageStyle,
            background:
              "repeating-linear-gradient(-45deg, var(--red), var(--red) 3px, rgba(183,61,61,0.7) 3px, rgba(183,61,61,0.7) 6px)",
          }}
        />
      )}
      {showTarget && (
        <div
          aria-hidden
          className="absolute -inset-y-[3px] w-px bg-[var(--ink)] opacity-70"
          style={{ left: `${TARGET_AT.toString()}%` }}
        >
          <div
            className="absolute left-[-2px] top-0 h-[5px] w-[5px] rotate-45 bg-[var(--ink)]"
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}

// The five canonical allocation-bucket colors from the design system.
// Use these for segment colors when the bar represents bucket-level
// utilization (the standard case in the Allocations dashboard).
export const BUCKET_COLORS = {
  training: "var(--b-training)",
  coursedev: "var(--b-coursedev)",
  admin: "var(--b-admin)",
  compliance: "var(--b-compliance)",
  pto: "var(--b-pto)",
} as const;
