"use client";

import type { ReportSlug } from "@arbor/shared";
import { useLabel } from "@/components/labels";

// One filter pane component per report slug, sharing a small set of
// primitives. Filters are stored as untyped Record<string, unknown> on the
// runner so we can persist them as jsonb in saved_reports.

type Bucket = { id: string; name: string };
type Instructor = { id: string; full_name: string };

type Props = {
  slug: ReportSlug;
  buckets: Bucket[];
  instructors: Instructor[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export default function FilterPane({ slug, buckets, instructors, value, onChange }: Props) {
  const instructorPlural = useLabel("entity.instructor", { plural: true });

  function setField(key: string, v: unknown) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="border-border bg-background sticky top-4 space-y-4 rounded-lg border p-4">
      <div>
        <p className="text-foreground text-sm font-semibold">Filters</p>
        <p className="text-muted-foreground text-xs">Preview updates as you type.</p>
      </div>

      {slug === "department-comparison" ? (
        <p className="text-muted-foreground text-xs">
          This report is a live snapshot of every department right now — there are no filters to
          set.
        </p>
      ) : slug === "instructor-scorecard" ? (
        <MultiSelect
          label={instructorPlural}
          options={instructors.map((i) => ({ value: i.id, label: i.full_name }))}
          value={(value.instructor_ids as string[] | undefined) ?? []}
          onChange={(next) => {
            setField("instructor_ids", next);
          }}
        />
      ) : slug === "utilization-trend" ? (
        <NumberInput
          label="Months of history"
          value={(value.months as number | undefined) ?? 12}
          min={1}
          max={36}
          onChange={(v) => {
            setField("months", v);
          }}
        />
      ) : (
        <DateRange
          start={value.start_date as string | undefined}
          end={value.end_date as string | undefined}
          onStart={(v) => {
            setField("start_date", v || null);
          }}
          onEnd={(v) => {
            setField("end_date", v || null);
          }}
        />
      )}

      {(slug === "allocation" || slug === "coverage") && (
        <MultiSelect
          label="Buckets"
          options={buckets.map((b) => ({ value: b.id, label: b.name }))}
          value={(value.bucket_ids as string[] | undefined) ?? []}
          onChange={(next) => {
            setField("bucket_ids", next);
          }}
        />
      )}

      {slug === "workload" && (
        <>
          <MultiSelect
            label={instructorPlural}
            options={instructors.map((i) => ({ value: i.id, label: i.full_name }))}
            value={(value.instructor_ids as string[] | undefined) ?? []}
            onChange={(next) => {
              setField("instructor_ids", next);
            }}
          />
          <Select
            label="Utilization band"
            options={[
              { value: "all", label: "All" },
              { value: "over_allocated", label: "Over-allocated" },
              { value: "at_risk", label: "At risk" },
              { value: "balanced", label: "Balanced" },
              { value: "under_utilized", label: "Under-utilized" },
            ]}
            value={(value.utilization_band as string | undefined) ?? "all"}
            onChange={(v) => {
              setField("utilization_band", v);
            }}
          />
        </>
      )}

      {slug === "coverage" && (
        <Toggle
          label="Show only gaps"
          checked={!!value.show_only_gaps}
          onChange={(v) => {
            setField("show_only_gaps", v);
          }}
        />
      )}

      {slug === "project-status" && (
        <>
          <MultiSelect
            label="Status"
            options={[
              { value: "planning", label: "Planning" },
              { value: "active", label: "Active" },
              { value: "on_hold", label: "On hold" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            value={(value.status as string[] | undefined) ?? ["planning", "active"]}
            onChange={(next) => {
              setField("status", next);
            }}
          />
          <MultiSelect
            label="Priority"
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]}
            value={(value.priority as string[] | undefined) ?? []}
            onChange={(next) => {
              setField("priority", next);
            }}
          />
        </>
      )}

      {slug === "skill-gap" && (
        <NumberInput
          label="Expiry window (days)"
          value={(value.expiry_window_days as number | undefined) ?? 90}
          min={1}
          max={365}
          onChange={(v) => {
            setField("expiry_window_days", v);
          }}
        />
      )}
    </div>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────

const inputClass =
  "border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs font-medium">{label}</p>
      {children}
    </div>
  );
}

function DateRange({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string | undefined;
  end: string | undefined;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Start">
        <input
          type="date"
          value={start ?? ""}
          onChange={(e) => {
            onStart(e.target.value);
          }}
          className={inputClass}
        />
      </Field>
      <Field label="End">
        <input
          type="date"
          value={end ?? ""}
          onChange={(e) => {
            onEnd(e.target.value);
          }}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }
  return (
    <Field label={label}>
      <div className="border-input bg-background max-h-32 overflow-y-auto rounded-md border p-1">
        {options.length === 0 ? (
          <p className="text-muted-foreground px-1 py-0.5 text-xs">None available.</p>
        ) : (
          options.map((o) => (
            <label
              key={o.value}
              className="hover:bg-surface flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs"
            >
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => {
                  toggle(o.value);
                }}
              />
              <span className="text-foreground truncate">{o.label}</span>
            </label>
          ))
        )}
      </div>
    </Field>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span className="text-foreground">{label}</span>
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className={inputClass}
      />
    </Field>
  );
}
