import { useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Wraps a form input with the standard label / helper / error treatment.
// Most forms in the app reinvent this; the wrapping divs, label classes,
// and helper-text styling were copy-pasted with subtle drift.
//
// Usage:
//   <Field label="Class name" helper="Up to 200 characters" error={errors.name?.message}>
//     <Input value={name} onChange={...} />
//   </Field>
//
// The child must be a single form control; we clone it to inject `id`
// and `aria-describedby` so the label / helper / error are wired up.

type Props = {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
};

export function Field({
  label,
  helper,
  error,
  required = false,
  htmlFor,
  className,
  children,
}: Props) {
  const generatedId = useId();
  const id = htmlFor ?? children.props.id ?? generatedId;
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  // Clone the single child so callers don't have to repeat the id wiring.
  const enhancedChild = {
    ...children,
    props: {
      ...children.props,
      id,
      "aria-describedby": describedBy,
      "aria-invalid": error ? true : children.props["aria-invalid"],
    },
  };

  return (
    <div className={cn("space-y-1", className)}>
      <label
        htmlFor={id}
        className="text-muted-foreground block font-mono text-[10px] font-medium uppercase tracking-[0.08em]"
      >
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {enhancedChild}
      {helper && !error && (
        <p id={helperId} className="text-muted-foreground text-[11px] leading-snug">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive text-[11px] leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
