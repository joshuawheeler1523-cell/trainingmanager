"use client";

// SVG donut chart showing workload breakdown by allocation bucket.
// Pure SVG, no chart library. Each slice is a stroke-dashoffset arc on a
// single circle — clean, accessible, and ~80 lines.

import type { BucketSlice } from "@arbor/shared";

type Props = {
  slices: BucketSlice[];
  size?: number; // px, default 180
  strokeWidth?: number; // px, default 22
  // Optional center label (e.g. total hours)
  centerLabel?: string;
  centerSubLabel?: string;
};

export default function BucketDonut({
  slices,
  size = 180,
  strokeWidth = 22,
  centerLabel,
  centerSubLabel,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = slices.map((s, i) => {
    const length = (s.percent / 100) * circumference;
    const arc = (
      <circle
        key={`${s.bucket_id ?? "none"}-${i.toString()}`}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={s.bucket_color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${length.toFixed(2)} ${(circumference - length).toFixed(2)}`}
        strokeDashoffset={(-offset).toFixed(2)}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx.toString()} ${cy.toString()})`}
      >
        <title>{`${s.bucket_label}: ${s.hours.toFixed(0)} hrs (${s.percent.toFixed(1)}%)`}</title>
      </circle>
    );
    offset += length;
    return arc;
  });

  if (slices.length === 0) {
    return (
      <div
        className="text-muted-foreground flex items-center justify-center text-xs"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size.toString()} ${size.toString()}`}>
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-surface"
          />
          {arcs}
        </svg>
        {(centerLabel || centerSubLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerLabel && (
              <span className="text-foreground text-lg font-semibold tabular-nums">
                {centerLabel}
              </span>
            )}
            {centerSubLabel && (
              <span className="text-muted-foreground text-xs">{centerSubLabel}</span>
            )}
          </div>
        )}
      </div>

      <ul className="mt-3 max-w-[260px] space-y-1 text-xs">
        {slices.map((s, i) => (
          <li
            key={`${s.bucket_id ?? "none"}-${i.toString()}-legend`}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.bucket_color }}
                aria-hidden
              />
              <span className="text-foreground truncate">{s.bucket_label}</span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {s.hours.toFixed(0)}h ({s.percent.toFixed(0)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
