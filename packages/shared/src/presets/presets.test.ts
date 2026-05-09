import { describe, it, expect } from "vitest";
import { PRESETS, PRESET_LIST, getPreset, TOGGLEABLE_MODULES } from "./index";

describe("preset library", () => {
  it("exports exactly 8 presets", () => {
    expect(PRESET_LIST).toHaveLength(8);
  });

  it("includes hospital_training as the first preset (default in picker)", () => {
    expect(PRESET_LIST[0]?.key).toBe("hospital_training");
  });

  it("every preset declares every toggleable module (no missing keys)", () => {
    for (const preset of PRESET_LIST) {
      for (const moduleKey of TOGGLEABLE_MODULES) {
        expect(
          preset.modules[moduleKey],
          `${preset.key} missing module ${moduleKey}`,
        ).toBeDefined();
      }
    }
  });

  it("every preset's key matches its registry key", () => {
    for (const [registryKey, preset] of Object.entries(PRESETS)) {
      expect(preset.key, `mismatch in registry: ${registryKey}`).toBe(registryKey);
    }
  });

  it("getPreset returns hospital_training for unknown keys (safe fallback)", () => {
    expect(getPreset("nonsense_key").key).toBe("hospital_training");
  });

  it("getPreset returns the correct preset for valid keys", () => {
    expect(getPreset("emr_analyst").key).toBe("emr_analyst");
    expect(getPreset("custom").key).toBe("custom");
  });
});

describe("hospital_training preset (gold-path regression guard)", () => {
  // CHANGING THIS TEST IS A USER-VISIBLE CHANGE for hospital training teams.
  // Their default experience flows from this preset. Update intentionally.
  const preset = PRESETS.hospital_training;

  it("exists", () => {
    expect(preset).toBeDefined();
  });

  it("has every toggleable module ON", () => {
    expect(preset.modules).toEqual({
      "module.classes": true,
      "module.training_planner": true,
      "module.education_requests": true,
    });
  });

  it("uses canonical default labels (empty overrides)", () => {
    expect(preset.roleLabels).toEqual({});
    expect(preset.entityLabels).toEqual({});
  });

  it("seeds the training-default bucket template", () => {
    expect(preset.defaultBucketTemplate).toBe("training-default");
  });
});

describe("custom preset", () => {
  const preset = PRESETS.custom;

  it("starts with all toggleable modules OFF", () => {
    expect(preset.modules).toEqual({
      "module.classes": false,
      "module.training_planner": false,
      "module.education_requests": false,
    });
  });

  it("has no default bucket template (manager configures manually)", () => {
    expect(preset.defaultBucketTemplate).toBe(null);
  });
});
