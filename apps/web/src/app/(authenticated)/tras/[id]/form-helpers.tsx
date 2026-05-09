"use client";

// Shared form-field building blocks for the TRA wizard steps. Each step
// renders a vertical stack of these so the markup stays terse.

import { type ReactNode } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";

const inputClass =
  "border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50";

export function FieldRow({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string | undefined;
  required?: boolean | undefined;
}) {
  return (
    <div>
      <label className="text-foreground mb-1 block text-xs font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {hint && <p className="text-muted-foreground mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  disabled,
  hint,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
  placeholder?: string;
  type?: "text" | "email" | "date" | "datetime-local" | "number";
  required?: boolean;
}) {
  return (
    <FieldRow label={label} hint={hint} required={required}>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={inputClass}
      />
    </FieldRow>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  rows = 4,
  hint,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  hint?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <FieldRow label={label} hint={hint} required={required}>
      <textarea
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={inputClass}
      />
    </FieldRow>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
  hint,
  required,
  placeholder = "—",
}: {
  label: string;
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  hint?: string | undefined;
  required?: boolean | undefined;
  placeholder?: string;
}) {
  return (
    <FieldRow label={label} hint={hint} required={required}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value as T | "");
        }}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

export function MultiCheckField<T extends string>({
  label,
  values,
  onChange,
  options,
  disabled,
  hint,
}: {
  label: string;
  values: T[];
  onChange: (v: T[]) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  hint?: string;
}) {
  function toggle(v: T) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  }
  return (
    <FieldRow label={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => {
                toggle(o.value);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:bg-surface"
              } disabled:opacity-50`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </FieldRow>
  );
}

export function TagInputField({
  label,
  values,
  onChange,
  disabled,
  hint,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <div className="border-input bg-background flex flex-wrap gap-1.5 rounded-md border p-2">
        {values.map((v, i) => (
          <span
            key={`${v}-${String(i)}`}
            className="bg-surface text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(values.filter((_, j) => j !== i));
              }}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder ?? "Add and press Enter"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const v = e.currentTarget.value.trim();
              if (v && !values.includes(v)) onChange([...values, v]);
              e.currentTarget.value = "";
            }
          }}
          className="text-foreground min-w-[8rem] flex-1 bg-transparent text-sm focus:outline-none disabled:opacity-50"
        />
      </div>
    </FieldRow>
  );
}

export function RepeatableSection<T>({
  label,
  rows,
  onChange,
  renderRow,
  newRow,
  disabled,
  addLabel = "Add row",
}: {
  label: string;
  rows: T[];
  onChange: (v: T[]) => void;
  renderRow: (row: T, update: (next: T) => void, remove: () => void, idx: number) => ReactNode;
  newRow: () => T;
  disabled?: boolean;
  addLabel?: string;
}) {
  return (
    <FieldRow label={label}>
      <div className="space-y-2">
        {rows.map((row, idx) =>
          renderRow(
            row,
            (next) => {
              onChange(rows.map((r, i) => (i === idx ? next : r)));
            },
            () => {
              onChange(rows.filter((_, i) => i !== idx));
            },
            idx,
          ),
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange([...rows, newRow()]);
          }}
          className="border-input text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1.5 text-xs disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>
    </FieldRow>
  );
}

export function RemoveRowButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
      aria-label="Remove row"
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  );
}

export function SaveBar({
  dirty,
  pending,
  onSave,
  onDiscard,
  disabled,
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="border-border bg-background sticky bottom-16 z-10 flex items-center justify-end gap-2 rounded-md border px-3 py-2 shadow-sm">
      <button
        type="button"
        disabled={disabled || pending || !dirty}
        onClick={onDiscard}
        className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        Discard
      </button>
      <button
        type="button"
        disabled={disabled || pending || !dirty}
        onClick={onSave}
        className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save section"}
      </button>
    </div>
  );
}
