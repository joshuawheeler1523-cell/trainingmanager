"use client";

import type { CapacityForecastMonth } from "@arbor/shared";
import { capacityTier } from "@arbor/shared";

// Stacked monthly demand bars (committed + pipeline) with a per-month capacity
// marker. Capacity varies month to month (dated PTO), so it's drawn as a tick
// over each bar rather than one flat line. Months where demand exceeds capacity
// are flagged. Bars live in an SVG; month labels live in a parallel HTML row
// below (same approach as forecast-bars.tsx, which avoids text distortion when
// the SVG stretches wider than its viewBox).

const VB_W = 1000;
const VB_H = 260;
const PAD = { top: 16, right: 12, bottom: 12, left: 44 };

function monthLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

export default function CapacityForecastChart({ months }: { months: CapacityForecastMonth[] }) {
  if (months.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">No forecast data for this scope.</p>
      </div>
    );
  }

  const innerW = VB_W - PAD.left - PAD.right;
  const innerH = VB_H - PAD.top - PAD.bottom;

  const maxVal = Math.max(
    1,
    ...months.map((m) => Math.max(m.committed_hours + m.pipeline_hours, m.available_hours)),
  );
  // Round the axis up to a "nice" ceiling for readable gridlines.
  const ceil = niceCeil(maxVal);
  const yFor = (v: number) => PAD.top + innerH - (v / ceil) * innerH;

  const slot = innerW / months.length;
  const barW = Math.min(slot * 0.62, 56);
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ceil);

  return (
    <div className="space-y-2">
      <div className="border-border bg-background overflow-x-auto rounded-xl border p-3">
        <svg viewBox={`0 0 ${VB_W.toString()} ${VB_H.toString()}`} className="h-auto w-full">
          {/* gridlines + y labels */}
          {gridYs.map((g) => {
            const y = yFor(g);
            return (
              <g key={g}>
                <line
                  x1={PAD.left}
                  x2={VB_W - PAD.right}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray={g === 0 ? undefined : "3 4"}
                />
                <text x={6} y={y + 3} fontSize={10} fill="var(--muted-foreground)">
                  {Math.round(g).toLocaleString()}
                </text>
              </g>
            );
          })}

          {months.map((m, i) => {
            const cx = PAD.left + slot * i + (slot - barW) / 2;
            const demand = m.committed_hours + m.pipeline_hours;
            const tier = capacityTier(demand, m.available_hours);
            const committedTop = yFor(m.committed_hours);
            const stackTop = yFor(demand);
            const base = yFor(0);
            const capY = yFor(m.available_hours);
            return (
              <g key={m.month_start}>
                {/* committed (bottom) */}
                <rect
                  x={cx}
                  y={committedTop}
                  width={barW}
                  height={Math.max(0, base - committedTop)}
                  fill="var(--primary)"
                  rx={2}
                />
                {/* pipeline (stacked on top) */}
                {m.pipeline_hours > 0 && (
                  <rect
                    x={cx}
                    y={stackTop}
                    width={barW}
                    height={Math.max(0, committedTop - stackTop)}
                    fill="var(--highlight)"
                    rx={2}
                  />
                )}
                {/* capacity marker for this month */}
                <line
                  x1={cx - 4}
                  x2={cx + barW + 4}
                  y1={capY}
                  y2={capY}
                  stroke={tier === "over" ? "var(--danger)" : "var(--foreground)"}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                />
                {/* over-capacity flag */}
                {tier === "over" && (
                  <circle cx={cx + barW / 2} cy={stackTop - 7} r={3} fill="var(--danger)" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Month labels — parallel HTML row so text isn't distorted by SVG scaling */}
      <div className="text-muted-foreground flex pl-[4.4%] text-[10px]">
        {months.map((m) => (
          <div key={m.month_start} className="flex-1 text-center tabular-nums">
            {monthLabel(m.month_start)}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs">
        <LegendDot color="var(--primary)" label="Committed" />
        <LegendDot color="var(--highlight)" label="Pipeline (incoming)" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[var(--foreground)]" />
          Available capacity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--danger)" }} />
          Over capacity
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// Round up to a readable axis ceiling (1/2/2.5/5 × 10^n).
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}
