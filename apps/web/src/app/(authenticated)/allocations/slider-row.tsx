"use client";

import type { AllocationBucket } from "@arbor/shared";

type Props = {
  bucket: AllocationBucket;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** When set, the row also shows annual_hours_base × value as a yearly-hours preview. */
  annualHoursBase?: number;
};

function formatHours(hours: number): string {
  // Round to a whole number; use locale separators for readability.
  return Math.round(hours).toLocaleString();
}

export default function SliderRow({ bucket, value, onChange, disabled, annualHoursBase }: Props) {
  const hours = annualHoursBase != null ? (annualHoursBase * value) / 100 : null;

  return (
    <div className="border-border bg-background flex items-center gap-4 rounded-lg border p-4">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: bucket.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-foreground truncate text-sm font-medium">{bucket.name}</span>
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {value.toFixed(1)}%
            {hours != null && (
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                · {formatHours(hours)} h/yr
              </span>
            )}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(Number(e.target.value));
          }}
          aria-label={`${bucket.name} percentage`}
          className="mt-2 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{ accentColor: bucket.color }}
        />
      </div>
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(0, Math.min(100, n)));
        }}
        className="border-input bg-background text-foreground focus:ring-ring w-20 rounded-md border px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 disabled:opacity-50"
        aria-label={`${bucket.name} percentage (numeric)`}
      />
    </div>
  );
}
