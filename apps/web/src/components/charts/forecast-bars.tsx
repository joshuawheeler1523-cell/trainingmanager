"use client";

// 8-week (or N-week) forecast bar chart with weekly capacity overlaid as a
// horizontal line. Bars colored green/amber/red based on weekly
// utilization.
//
// Layout: the bars live in an SVG; the date + projected-hour labels live
// in a parallel HTML flex row below. Previously we tried to put both in
// the same SVG via <foreignObject> + preserveAspectRatio="none", which
// horizontally stretched the text into illegible glyphs when the chart
// rendered wider than its 100-unit viewBox.

import { forecastTier, type ForecastWeek } from "@arbor/shared";

type Props = {
  weeks: ForecastWeek[];
  /** Bar area height in px (excludes label row). Default 140. */
  height?: number;
};

const TIER_FILL = {
  ok: "fill-emerald-500",
  near: "fill-amber-500",
  over: "fill-destructive",
} as const;

const TIER_DOT = {
  ok: "bg-emerald-500",
  near: "bg-amber-500",
  over: "bg-destructive",
} as const;

export default function ForecastBars({ weeks, height = 140 }: Props) {
  if (weeks.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          Forecast unavailable — no workload sources for this instructor yet.
        </p>
      </div>
    );
  }

  const weeklyCapacity = weeks[0]?.weekly_capacity ?? 0;
  const maxProjected = Math.max(...weeks.map((w) => w.projected_hours || 0));
  // Y-axis max: at least 110% of capacity, or 110% of the tallest bar.
  const yMax = Math.max(weeklyCapacity * 1.1, maxProjected * 1.1, 1);

  // SVG coordinates: we use 0..1000 wide so per-bar widths read as
  // percentage-style numbers without sub-pixel rounding. The
  // preserveAspectRatio="none" horizontally stretches it to fit the
  // container — bars are rectangles so they don't care about distortion.
  const viewBoxWidth = 1000;
  const barGapPct = 1.5; // 1.5% of width
  const barGap = (viewBoxWidth * barGapPct) / 100;
  const barWidth = (viewBoxWidth - barGap * (weeks.length - 1)) / weeks.length;
  const capacityY = height - (weeklyCapacity / yMax) * height;

  function shortDateLabel(d: string): string {
    const dt = new Date(d + "T00:00:00Z");
    return dt.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-foreground text-sm font-medium">{weeks.length}-week forecast</span>
        <span className="text-muted-foreground text-xs">
          Weekly capacity: {weeklyCapacity.toFixed(1)} h
        </span>
      </div>

      {/* Bar area — SVG with bars + capacity line only. No text. */}
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${viewBoxWidth.toString()} ${height.toString()}`}
        preserveAspectRatio="none"
        className="block"
        role="img"
        aria-label="Weekly forecast bars"
      >
        {weeklyCapacity > 0 && (
          <line
            x1={0}
            y1={capacityY}
            x2={viewBoxWidth}
            y2={capacityY}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            className="text-muted-foreground/60"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {weeks.map((w, i) => {
          const tier = forecastTier(w);
          const x = i * (barWidth + barGap);
          const barH = ((w.projected_hours || 0) / yMax) * height;
          const y = height - barH;
          return (
            <rect
              key={w.week_start}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barH, 0.5)}
              rx={3}
              className={TIER_FILL[tier]}
            >
              <title>
                {`${w.week_start}: ${(w.projected_hours || 0).toFixed(1)}h projected · ${(
                  w.utilization_pct ?? 0
                ).toFixed(0)}% util`}
              </title>
            </rect>
          );
        })}
      </svg>

      {/* Label row — regular HTML so text doesn't get SVG-stretched. */}
      <div className="flex gap-[1.5%]">
        {weeks.map((w) => {
          const tier = forecastTier(w);
          return (
            <div
              key={`${w.week_start}-label`}
              className="text-muted-foreground flex min-w-0 flex-1 flex-col items-center text-center text-[10px] leading-tight"
            >
              <span className="truncate">{shortDateLabel(w.week_start)}</span>
              <span
                className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium ${
                  tier === "over"
                    ? "text-destructive"
                    : tier === "near"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                }`}
              >
                {(w.projected_hours || 0).toFixed(1)}h
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-sm ${TIER_DOT.ok}`} />
          Under 80%
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-sm ${TIER_DOT.near}`} />
          80–94%
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-sm ${TIER_DOT.over}`} />
          95%+
        </span>
        <span className="ml-2 inline-flex items-center gap-1">
          <span className="bg-foreground/40 inline-block h-px w-3" />
          Weekly capacity
        </span>
      </div>
    </div>
  );
}
