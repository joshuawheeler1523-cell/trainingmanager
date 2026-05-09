import type { LabelMap } from "./types";

/**
 * Canonical default labels. These are what the UI renders when an org has no
 * override for a given label kind. Match the strings users see today on the
 * hospital training preset.
 *
 * Pinned by labels.test.ts as a regression guard: if any of these change, the
 * snapshot test fails. Update intentionally.
 */
export const DEFAULT_LABELS: LabelMap = {
  "role.manager": { singular: "Manager", plural: "Managers" },
  "role.instructor": { singular: "Instructor", plural: "Instructors" },
  "role.viewer": { singular: "Viewer", plural: "Viewers" },
  "entity.instructor": { singular: "Instructor", plural: "Instructors" },
};
