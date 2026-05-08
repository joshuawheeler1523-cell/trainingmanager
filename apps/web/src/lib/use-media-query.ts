"use client";

import { useEffect, useState } from "react";

/**
 * Reactively returns whether the given media query matches. Returns `false`
 * during SSR / first paint to avoid hydration mismatches; the real value
 * lands on the next tick.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => {
      setMatches(mql.matches);
    };
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
    };
  }, [query]);

  return matches;
}

// Tailwind's md breakpoint = 768px. Use this to decide whether the Gantt /
// Calendar views should fall back to the (mobile-friendlier) Kanban view.
export function useIsNarrow(): boolean {
  return !useMediaQuery("(min-width: 768px)");
}
