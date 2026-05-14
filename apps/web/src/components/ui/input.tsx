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

const FIELD_BASE =
  "border-input bg-background text-foreground focus:ring-ring w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

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
