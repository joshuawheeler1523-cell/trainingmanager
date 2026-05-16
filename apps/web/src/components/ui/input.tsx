import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

// The `fieldClass` string that's redeclared as a local constant in 30+
// files. Centralizing it here means a typography/spacing pass touches one
// place. Tabular-numbers is opt-in via the `tabular` prop for hour /
// percentage / count inputs where the digits should align.

// Editorial field treatment: paper bg, hair-soft border at rest, forest
// border + 3px forest tint glow on focus. Slightly more padding than the
// previous compact style, to match the design's "breathable" feel.
const FIELD_BASE =
  "border-[var(--hair)] bg-background text-foreground w-full rounded-sm border px-3 py-2 text-sm focus:outline-none focus:border-[var(--forest)] focus:ring-[3px] focus:ring-[rgba(45,74,46,0.12)] disabled:cursor-not-allowed disabled:opacity-50 transition-[border-color,box-shadow] duration-150";

type InputProps = InputHTMLAttributes<HTMLInputElement> & { tabular?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, tabular = false, ...rest },
  ref,
) {
  return (
    <input ref={ref} className={cn(FIELD_BASE, tabular && "tabular-nums", className)} {...rest} />
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(FIELD_BASE, className)} {...rest} />;
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(FIELD_BASE, className)} {...rest}>
      {children}
    </select>
  );
});
