import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

// 9-segment progress rail from the editorial design system. Replaces the
// "step pill" row at the top of multi-section wizards (TRAs, Training
// Planner) with a tighter, less colorful indicator: 4px tinted segments
// plus mono uppercase numeric labels underneath. The current segment is
// persimmon, completed segments are forest, upcoming segments are hair.

export type SectionState = "done" | "current" | "upcoming";

export type SectionRailItem = {
  id: number;
  label: string;
  state: SectionState;
  disabled?: boolean;
};

type Props = {
  sections: SectionRailItem[];
  /** Called when a non-disabled segment is clicked. */
  onSelect?: (id: number) => void;
  /** Optional content shown above the rail (e.g., "Draft · saved 2m ago"). */
  meta?: ReactNode;
};

const BAR: Record<SectionState, string> = {
  done: "bg-[var(--forest)]",
  current: "bg-[var(--persimmon)]",
  upcoming: "bg-[var(--hair-soft,rgba(28,31,28,0.10))]",
};

export function SectionRail({ sections, onSelect, meta }: Props) {
  const count = sections.length;
  return (
    <div className="space-y-2">
      {meta && (
        <div className="text-muted-foreground font-mono text-[11px] uppercase leading-none tracking-[0.04em]">
          {meta}
        </div>
      )}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${String(count)}, minmax(0, 1fr))` }}
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={s.disabled ?? !onSelect}
            onClick={() => onSelect?.(s.id)}
            aria-label={`Section ${String(s.id).padStart(2, "0")} — ${s.label}`}
            aria-current={s.state === "current" ? "step" : undefined}
            className={cn(
              "h-1 rounded-sm transition-colors",
              BAR[s.state],
              onSelect && !s.disabled && "cursor-pointer hover:opacity-80",
              (s.disabled ?? !onSelect) && "cursor-default",
            )}
          />
        ))}
      </div>
      <div
        className="grid gap-1 font-mono text-[9px] uppercase leading-none tracking-[0.04em]"
        style={{ gridTemplateColumns: `repeat(${String(count)}, minmax(0, 1fr))` }}
      >
        {sections.map((s) => (
          <span
            key={s.id}
            className={cn(
              "truncate text-center",
              s.state === "current"
                ? "font-medium text-[var(--persimmon-deep)]"
                : "text-muted-foreground",
            )}
          >
            {String(s.id).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}
