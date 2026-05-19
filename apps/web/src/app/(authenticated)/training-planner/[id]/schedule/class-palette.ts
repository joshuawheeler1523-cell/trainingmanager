// Shared class-color palette + lookup. Single source of truth used by the
// calendar view, the grid view, and the color picker legend.
//
// Muted editorial tones — soft, ~80% lightness, low saturation. Sits inside
// Arbor's cream/forest/sage/persimmon brand rather than fighting it.

export const CLASS_PALETTE = [
  "#c8d1c1", // sage-soft (lives inside the brand)
  "#c7d4dc", // dusty blue
  "#d4c7d8", // dusty lavender
  "#e8d2bc", // light clay (persimmon-adjacent)
  "#e0d6b4", // soft gold
  "#bdd1cb", // muted teal
  "#dbc4c4", // dusty rose
  "#b9c3a3", // soft moss
  "#c7b9c7", // muted plum
  "#d6c89e", // muted ochre
  "#c5cbcd", // warm slate
  "#d8cdc0", // light taupe
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic default color for a class id. The picker overrides this
 *  via impl_classes.color when the user sets a custom value. */
export function colorForClass(classId: string): string {
  return CLASS_PALETTE[hashString(classId) % CLASS_PALETTE.length] ?? "#c8d1c1";
}

/** Resolve the effective color for an impl_class — explicit override first,
 *  then deterministic default. Pass the raw class row's `color` field. */
export function resolveClassColor(classId: string, override: string | null | undefined): string {
  if (override && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(override)) return override;
  return colorForClass(classId);
}
