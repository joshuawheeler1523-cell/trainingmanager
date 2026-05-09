import { describe, it, expect } from "vitest";
import { DEFAULT_LABELS, resolveLabels } from "./index";

describe("DEFAULT_LABELS (regression snapshot)", () => {
  it("locks the hospital-training default strings", () => {
    // CHANGING THIS SNAPSHOT IS A USER-VISIBLE CHANGE. Update intentionally.
    // The hospital training preset is the gold-path; defaults must match what
    // training teams see today.
    expect(DEFAULT_LABELS).toEqual({
      "role.manager": { singular: "Manager", plural: "Managers" },
      "role.instructor": { singular: "Instructor", plural: "Instructors" },
      "role.viewer": { singular: "Viewer", plural: "Viewers" },
      "entity.instructor": { singular: "Instructor", plural: "Instructors" },
    });
  });
});

describe("resolveLabels", () => {
  it("returns defaults when no overrides given", () => {
    expect(resolveLabels({})).toEqual(DEFAULT_LABELS);
  });

  it("returns defaults when overrides are null", () => {
    expect(resolveLabels({ roleLabels: null, entityLabels: null })).toEqual(DEFAULT_LABELS);
  });

  it("returns defaults when overrides are empty objects", () => {
    expect(resolveLabels({ roleLabels: {}, entityLabels: {} })).toEqual(DEFAULT_LABELS);
  });

  it("applies a full role label override", () => {
    const result = resolveLabels({
      roleLabels: { "role.instructor": { singular: "Trainer", plural: "Trainers" } },
    });
    expect(result["role.instructor"]).toEqual({ singular: "Trainer", plural: "Trainers" });
    expect(result["role.manager"]).toEqual(DEFAULT_LABELS["role.manager"]);
  });

  it("falls back to default for missing singular/plural in a partial override", () => {
    const result = resolveLabels({
      roleLabels: { "role.instructor": { singular: "Trainer" } }, // no plural
    });
    expect(result["role.instructor"]).toEqual({ singular: "Trainer", plural: "Instructors" });
  });

  it("entity overrides apply alongside role overrides", () => {
    const result = resolveLabels({
      roleLabels: { "role.instructor": { singular: "Analyst", plural: "Analysts" } },
      entityLabels: { "entity.instructor": { singular: "Analyst", plural: "Analysts" } },
    });
    expect(result["role.instructor"].singular).toBe("Analyst");
    expect(result["entity.instructor"].singular).toBe("Analyst");
  });

  it("ignores unknown keys without breaking", () => {
    const result = resolveLabels({
      // @ts-expect-error — testing defensive handling of malformed input
      roleLabels: { "role.unknown_thing": { singular: "X", plural: "Xs" } },
    });
    expect(result).toEqual(DEFAULT_LABELS);
  });

  it("does not mutate DEFAULT_LABELS", () => {
    const before = JSON.stringify(DEFAULT_LABELS);
    resolveLabels({ roleLabels: { "role.manager": { singular: "Boss", plural: "Bosses" } } });
    expect(JSON.stringify(DEFAULT_LABELS)).toBe(before);
  });
});
