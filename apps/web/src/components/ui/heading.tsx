import { type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// One typographic ladder for headings across the app. The current pages
// blur h1 / h2 / h3 by using nearly-identical `text-lg font-semibold` and
// `text-sm font-semibold` everywhere, so users can't visually anchor.
//
//   level=1: top of page (PageHeader already covers this — most callers
//            won't need to use level=1 directly)
//   level=2: section heading inside a card / panel
//   level=3: subsection / labelled group
//
// `as` lets the rendered tag differ from the visual level when needed
// (e.g., visually level=2 but semantically <h3> because there's a real
// <h2> above it on the page).

export type HeadingLevel = 1 | 2 | 3;

const LEVEL: Record<HeadingLevel, { tag: ElementType; cls: string }> = {
  1: { tag: "h1", cls: "text-foreground text-xl font-bold tracking-tight" },
  2: { tag: "h2", cls: "text-foreground text-sm font-semibold" },
  3: {
    tag: "h3",
    cls: "text-muted-foreground text-xs font-semibold uppercase tracking-wide",
  },
};

type Props = HTMLAttributes<HTMLHeadingElement> & {
  level?: HeadingLevel;
  as?: ElementType;
  children: ReactNode;
};

export function Heading({ level = 2, as, className, children, ...rest }: Props) {
  const { tag, cls } = LEVEL[level];
  const Tag = as ?? tag;
  return (
    <Tag className={cn(cls, className)} {...rest}>
      {children}
    </Tag>
  );
}
