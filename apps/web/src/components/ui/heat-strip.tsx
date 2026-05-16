import { cn } from "@/lib/utils";

// Editorial 8-cell capacity heat strip from the design system. Each
// cell shows the utilization tier for one week. The 6-step h0..h5
// scale maps utilization% to color + readable text contrast. A
// 7th "leave" state hatches the cell when the trainer is on leave.
//
// The scale and colors are pulled verbatim from styles.css :root +
// the .heat.* rules:
//   h0  empty/0%           — bare cell, mute text
//   h1  ≤40%   has room    — light sage
//   h2  40–60%  light       — medium sage
//   h3  60–80%  balanced    — forest, cream text
//   h4  80–95%  at risk     — amber, ink text
//   h5  100%+   over        — red, cream text
//   leave                  — diagonal hatch
//
// The data shape matches ForecastWeek from @arbor/shared so this
// drop-in replaces or sits alongside ForecastBars.

export type HeatWeek = {
  /** ISO date for the start of this week. Used as a row key. */
  week_start: string;
  /** Utilization percentage 0–∞. Null treated as 0. */
  utilization_pct: number | null;
  /** Optional: render as the leave hatch instead of a color. */
  on_leave?: boolean;
  /** Optional: label inside the cell (e.g., week number). Falls back to derived "Wk N" if omitted. */
  label?: string;
};

type Props = {
  weeks: HeatWeek[];
  /** Cell height in px. Default 28 — matches the design. */
  cellHeight?: number;
  className?: string;
};

function tierFor(pct: number | null): "h0" | "h1" | "h2" | "h3" | "h4" | "h5" {
  if (pct == null || pct <= 0) return "h0";
  if (pct <= 40) return "h1";
  if (pct <= 60) return "h2";
  if (pct <= 80) return "h3";
  if (pct < 100) return "h4";
  return "h5";
}

const TIER_STYLES: Record<"h0" | "h1" | "h2" | "h3" | "h4" | "h5", string> = {
  h0: "bg-[rgba(28,31,28,0.04)] text-[var(--ink-mute)]",
  h1: "bg-[rgba(139,157,131,0.30)] text-[var(--forest-deep)]",
  h2: "bg-[rgba(139,157,131,0.55)] text-[var(--forest-deep)]",
  h3: "bg-[rgba(45,74,46,0.65)] text-[var(--cream)]",
  h4: "bg-[rgba(201,138,58,0.80)] text-[var(--ink)]",
  h5: "bg-[rgba(183,61,61,0.85)] text-[var(--cream)]",
};

export function HeatStrip({ weeks, cellHeight = 28, className }: Props) {
  return (
    <div
      className={cn("grid gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${weeks.length.toString()}, minmax(0, 1fr))` }}
    >
      {weeks.map((w, i) => {
        const tier = tierFor(w.utilization_pct);
        const label = w.label ?? `Wk ${(i + 1).toString()}`;
        const title = w.on_leave
          ? "On leave"
          : `${label} — ${w.utilization_pct == null ? "no data" : `${Math.round(w.utilization_pct).toString()}%`}`;
        return (
          <div
            key={w.week_start}
            title={title}
            aria-label={title}
            className={cn(
              "flex items-center justify-center rounded-[3px] font-mono text-[10px] tracking-[0.02em]",
              w.on_leave
                ? "bg-[repeating-linear-gradient(-45deg,rgba(28,31,28,0.06),rgba(28,31,28,0.06)_3px,transparent_3px,transparent_6px)] text-[var(--ink-mute)]"
                : TIER_STYLES[tier],
            )}
            style={{ height: `${cellHeight.toString()}px` }}
          >
            {w.on_leave ? "—" : label}
          </div>
        );
      })}
    </div>
  );
}

// Small legend strip matching the design's `.roster-foot .lg`. Render
// once below the strip so the user can read the color scale.
export function HeatStripLegend({ className }: { className?: string }) {
  const items: Array<{ tier: "h1" | "h2" | "h3" | "h4" | "h5"; label: string }> = [
    { tier: "h1", label: "Has room" },
    { tier: "h2", label: "Light" },
    { tier: "h3", label: "Balanced" },
    { tier: "h4", label: "At risk" },
    { tier: "h5", label: "Over" },
  ];
  return (
    <div
      className={cn(
        "border-border flex flex-wrap items-center gap-4 border-t border-dashed pt-3 font-mono text-[10px] tracking-[0.02em] text-[var(--ink-soft)]",
        className,
      )}
    >
      {items.map((i) => (
        <span key={i.tier} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("h-3.5 w-3.5 rounded-[2px]", TIER_STYLES[i.tier].split(" ")[0])}
          />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-3.5 w-3.5 rounded-[2px] bg-[repeating-linear-gradient(-45deg,rgba(28,31,28,0.06),rgba(28,31,28,0.06)_3px,transparent_3px,transparent_6px)]"
        />
        On leave
      </span>
    </div>
  );
}
