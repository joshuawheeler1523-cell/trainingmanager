"use client";

import type { LabelKind } from "@arbor/shared";
import { useOrgLabels } from "./org-identity-provider";

type LabelProps = {
  kind: LabelKind;
  /** When true, render the plural variant. */
  plural?: boolean;
  /** When true, render lowercase. Useful for mid-sentence usage. */
  lower?: boolean;
};

/**
 * Renders the org's chosen display label for a given kind. Falls back to
 * canonical defaults when no override is set.
 *
 * Examples:
 *   <Label kind="entity.instructor" plural />     → "Instructors" or org override
 *   <Label kind="role.manager" />                 → "Manager"
 *   <Label kind="entity.instructor" lower />      → "instructor" or "trainer"
 */
export function Label({ kind, plural = false, lower = false }: LabelProps) {
  const labels = useOrgLabels();
  const value = plural ? labels[kind].plural : labels[kind].singular;
  return <>{lower ? value.toLowerCase() : value}</>;
}

/**
 * Imperative form of <Label /> — for places where you need a string (e.g.
 * placeholder, aria-label, `<title>`). Hook-only; client components only.
 */
export function useLabel(
  kind: LabelKind,
  opts: { plural?: boolean; lower?: boolean } = {},
): string {
  const labels = useOrgLabels();
  const value = opts.plural ? labels[kind].plural : labels[kind].singular;
  return opts.lower ? value.toLowerCase() : value;
}
