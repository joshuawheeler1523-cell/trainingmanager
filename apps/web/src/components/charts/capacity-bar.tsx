"use client";

// Single horizontal bar showing assigned vs annual capacity. Color-codes
// based on utilization (under 80% = green, 80-95% = amber, 95+% = red).

type Props = {
  assigned: number;
  capacity: number;
  // Optional: show per-source segments instead of a single solid fill.
  // Each segment must be in absolute hours; the sum should equal `assigned`.
  segments?: { label: string; hours: number; color: string }[];
};

export default function CapacityBar({ assigned, capacity, segments }: Props) {
  const safeCapacity = capacity > 0 ? capacity : 1;
  const utilizationPct = (assigned / safeCapacity) * 100;
  const widthPct = Math.min(100, Math.max(0, utilizationPct));

  const tier = utilizationPct >= 95 ? "over" : utilizationPct >= 80 ? "near" : "ok";
  const fillClass =
    tier === "over" ? "bg-destructive" : tier === "near" ? "bg-warning" : "bg-success";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-foreground text-sm font-medium">
          {assigned.toFixed(0)}{" "}
          <span className="text-muted-foreground text-xs font-normal">
            / {capacity.toFixed(0)} hrs
          </span>
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            tier === "over" ? "text-destructive" : tier === "near" ? "text-warning" : "text-success"
          }`}
        >
          {utilizationPct.toFixed(0)}%
        </span>
      </div>

      <div
        className="bg-surface relative h-3 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.round(utilizationPct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {segments && segments.length > 0 ? (
          // Stacked segments: each takes up its share of capacity (not of
          // assigned), so the visualization stops at 100%.
          <div className="flex h-full w-full">
            {segments.map((s, i) => (
              <div
                key={`${s.label}-${i.toString()}`}
                style={{
                  width: `${Math.min(100, (s.hours / safeCapacity) * 100).toFixed(2)}%`,
                  backgroundColor: s.color,
                }}
                title={`${s.label}: ${s.hours.toFixed(0)} hrs`}
              />
            ))}
          </div>
        ) : (
          <div className={`h-full ${fillClass}`} style={{ width: `${widthPct.toFixed(2)}%` }} />
        )}

        {/* Capacity-line marker at 100% — only visible when assigned < capacity */}
        {utilizationPct < 100 && (
          <div className="border-foreground/30 absolute inset-y-0 right-0 border-l-2" />
        )}
      </div>

      {segments && segments.length > 0 && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {segments.map((s, i) => (
            <li
              key={`${s.label}-${i.toString()}-legend`}
              className="inline-flex items-center gap-1"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="text-foreground">{s.label}</span>
              <span className="tabular-nums">({s.hours.toFixed(0)}h)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
