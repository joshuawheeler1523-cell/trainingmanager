import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The recurring section-label pattern from the editorial design system:
// a small persimmon dot followed by a JetBrains Mono uppercase label in
// forest green. Use above section titles and above grouped controls
// where a small contextual kicker helps the reader anchor.
//
// Variants:
//   - default: forest text with persimmon dot (the canonical eyebrow)
//   - mute: ink-mute text, no dot — for less-emphatic kicker labels
//   - section: ink-mute text, no dot, slightly looser tracking — for
//     internal section-divider labels inside cards

export type EyebrowVariant = "default" | "mute" | "section";

const VARIANT: Record<EyebrowVariant, string> = {
  default:
    "text-[var(--forest)] tracking-[0.08em] before:content-[''] before:inline-block before:w-1.5 before:h-1.5 before:rounded-full before:bg-[var(--persimmon)] before:mr-2.5",
  mute: "text-muted-foreground tracking-[0.10em]",
  section: "text-muted-foreground tracking-[0.12em]",
};

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: EyebrowVariant;
  children: ReactNode;
};

export function Eyebrow({ variant = "default", className, children, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[11px] font-medium uppercase leading-none",
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
