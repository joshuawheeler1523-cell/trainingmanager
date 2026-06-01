"use client";

import type { UtilizationTrendDataset } from "@arbor/shared";

const W = 720;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

export default function UtilizationTrendView({ data }: { data: UtilizationTrendDataset }) {
  const pts = data.points.filter((p) => p.avg_utilization_pct != null);

  if (data.points.length === 0) {
    return (
      <div className="border-border bg-surface rounded-lg border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          No snapshots yet. The first one is captured tonight, then the trend fills in each night.
        </p>
      </div>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = pts.length;
  const xFor = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (v: number) => PAD.top + innerH - (Math.min(v, 100) / 100) * innerH;

  const line = pts
    .map((p, i) => `${xFor(i).toString()},${yFor(p.avg_utilization_pct ?? 0).toString()}`)
    .join(" ");
  const gridYs = [0, 25, 50, 75, 100];

  return (
    <div className="space-y-4">
      {data.points.length < 2 && (
        <p className="text-muted-foreground text-xs">
          Only {data.points.length} snapshot so far — a nightly job adds a point each night, so the
          line gets richer over time.
        </p>
      )}

      <div className="border-border bg-background overflow-x-auto rounded-lg border p-3">
        <svg
          viewBox={`0 0 ${W.toString()} ${H.toString()}`}
          className="h-auto w-full"
          role="img"
          aria-label="Average utilization over time"
        >
          {gridYs.map((g) => {
            const y = yFor(g);
            return (
              <g key={g}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray={g === 0 ? undefined : "3 3"}
                />
                <text x={4} y={y + 3} fontSize={9} fill="var(--muted-foreground)">
                  {g}%
                </text>
              </g>
            );
          })}
          {n > 1 && <polyline points={line} fill="none" stroke="var(--forest)" strokeWidth={2} />}
          {pts.map((p, i) => (
            <circle
              key={p.snapshot_date}
              cx={xFor(i)}
              cy={yFor(p.avg_utilization_pct ?? 0)}
              r={n === 1 ? 4 : 2.5}
              fill="var(--forest)"
            >
              <title>{`${p.snapshot_date}: ${(p.avg_utilization_pct ?? 0).toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted-foreground text-xs">
            <tr>
              <Th>Date</Th>
              <Th className="text-right">Avg utilization</Th>
              <Th className="text-right">Instructors</Th>
              <Th className="text-right">Assigned (h)</Th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {[...data.points].reverse().map((p) => (
              <tr key={p.snapshot_date}>
                <td className="text-foreground px-3 py-2 tabular-nums">{p.snapshot_date}</td>
                <td className="text-foreground px-3 py-2 text-right font-medium tabular-nums">
                  {p.avg_utilization_pct == null ? "—" : `${p.avg_utilization_pct.toFixed(1)}%`}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {p.instructor_count}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {Math.round(p.total_assigned_hours).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
