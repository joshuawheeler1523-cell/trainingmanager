export type DiffEntry = {
  key: string;
  kind: "added" | "removed" | "changed" | "unchanged";
  oldValue?: unknown;
  newValue?: unknown;
};

/**
 * Shallow diff of two JSON objects. Returns one entry per top-level key,
 * marked as added/removed/changed/unchanged.
 */
export function jsonDiff(
  oldObj: Record<string, unknown> | null | undefined,
  newObj: Record<string, unknown> | null | undefined,
): DiffEntry[] {
  const old_ = oldObj ?? {};
  const new_ = newObj ?? {};
  const keys = Array.from(new Set([...Object.keys(old_), ...Object.keys(new_)])).sort();

  return keys.map((key) => {
    const inOld = Object.prototype.hasOwnProperty.call(old_, key);
    const inNew = Object.prototype.hasOwnProperty.call(new_, key);

    if (!inOld) return { key, kind: "added", newValue: new_[key] };
    if (!inNew) return { key, kind: "removed", oldValue: old_[key] };

    const oldVal = JSON.stringify(old_[key]);
    const newVal = JSON.stringify(new_[key]);
    if (oldVal !== newVal)
      return { key, kind: "changed", oldValue: old_[key], newValue: new_[key] };
    return { key, kind: "unchanged", oldValue: old_[key], newValue: new_[key] };
  });
}
