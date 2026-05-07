"use client";

// 8-week (or N-week) forecast bar chart with weekly capacity overlaid as a
// horizontal line. Bars colored green/yellow/red based on weekly utilization.

import { forecastTier, type ForecastWeek } from "@arbor/shared";

type Props = {
  weeks: ForecastWeek[];
  height?: number; // px, default 160
};

const TIER_FILL = {
  ok: "fill-emerald-500",
  near: "fill-amber-500",
  over: "fill-destructive",
} as const;

export default function ForecastBars({ weeks, height = 160 }: Props) {
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
  // Y-axis max: at least 110% of capacity, or the highest projected hour.
  const maxProjected = Math.max(...weeks.map((w) => w.projected_hours || 0));
  const yMax = Math.max(weeklyCapacity * 1.1, maxProjected * 1.1, 1);

  // Layout
  const barGap = 8;
  const labelHeight = 28;
  const chartHeight = height - labelHeight;
  // Use a 100-unit viewBox width so bar widths are simple percentages.
  const viewBoxWidth = 100;
  const barWidth = (viewBoxWidth - barGap * (weeks.length - 1)) / weeks.length;

  const capacityY = chartHeight - (weeklyCapacity / yMax) * chartHeight;

  function shortLabel(d: string): string {
    // Convert YYYY-MM-DD → "MMM D"
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

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${viewBoxWidth.toString()} ${height.toString()}`}
        preserveAspectRatio="none"
        className="block"
        role="img"
        aria-label="Weekly forecast bars"
      >
        {/* Capacity reference line */}
        {weeklyCapacity > 0 && (
          <line
            x1={0}
            y1={capacityY}
            x2={viewBoxWidth}
            y2={capacityY}
            stroke="currentColor"
            strokeWidth={0.4}
            strokeDasharray="1.2 1"
            className="text-muted-foreground"
          />
        )}

        {weeks.map((w, i) => {
          const tier = forecastTier(w);
          const x = i * (barWidth + barGap);
          const barH = ((w.projected_hours || 0) / yMax) * chartHeight;
          const y = chartHeight - barH;
          return (
            <g key={w.week_start}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 0.5)}
                rx={1}
                className={TIER_FILL[tier]}
              >
                <title>
                  {`${w.week_start}: ${(w.projected_hours || 0).toFixed(1)}h projected · ${(w.utilization_pct ?? 0).toFixed(0)}% util`}
                </title>
              </rect>
            </g>
          );
        })}

        {/* X-axis labels rendered with foreignObject so we can use real CSS */}
        <foreignObject x={0} y={chartHeight + 4} width={viewBoxWidth} height={labelHeight}>
          <div
            className="text-muted-foreground flex h-full text-[7px] leading-tight"
            style={{ width: "100%" }}
          >
            {weeks.map((w, i) => (
              <div
                key={`${w.week_start}-label`}
                className="flex flex-col items-center justify-start"
                style={{
                  width: `${barWidth.toString()}%`,
                  marginLeft: i === 0 ? 0 : `${barGap.toString()}%`,
                }}
              >
                <span>{shortLabel(w.week_start)}</span>
                <span className="text-foreground font-medium">
                  {(w.projected_hours || 0).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </foreignObject>
      </svg>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
          Under 80%
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />
          80–94%
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="bg-destructive inline-block h-2 w-2 rounded-sm" />
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
