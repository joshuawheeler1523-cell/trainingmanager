import type { PresetKey, WorkspacePreset } from "./types";

/**
 * The v1 preset library. Eight presets, all hardcoded here so they ship as
 * code (single source of truth for both the picker UI and the
 * apply_workspace_preset RPC payload). v2 may move these to a DB table for
 * runtime customization.
 *
 * Editorial guideline: when adjusting any preset, also re-run the snapshot
 * test in presets.test.ts to catch unintended drift in the hospital_training
 * preset (the gold-path).
 */
export const PRESETS: Record<PresetKey, WorkspacePreset> = {
  hospital_training: {
    key: "hospital_training",
    name: "Hospital training",
    description:
      "Clinical training departments — instructors, classes, training planner, TRAs, and intake all enabled. The default preset.",
    modules: {
      "module.classes": true,
      "module.training_planner": true,
      "module.education_requests": true,
    },
    // Empty overrides → defaults render: Instructor / Manager / Viewer.
    roleLabels: {},
    entityLabels: {},
    defaultBucketTemplate: "training-default",
  },

  corporate_ld: {
    key: "corporate_ld",
    name: "Corporate L&D",
    description:
      "Non-healthcare learning & development teams. Trainers, classes, and training planner enabled.",
    modules: {
      "module.classes": true,
      "module.training_planner": true,
      "module.education_requests": false,
    },
    roleLabels: {
      "role.instructor": { singular: "Trainer", plural: "Trainers" },
    },
    entityLabels: {
      "entity.instructor": { singular: "Trainer", plural: "Trainers" },
    },
    defaultBucketTemplate: "ld-default",
  },

  emr_analyst: {
    key: "emr_analyst",
    name: "EMR analyst team",
    description:
      "Build, optimization, and support work for an EMR analyst team. Classes and training planner off.",
    modules: {
      "module.classes": false,
      "module.training_planner": false,
      "module.education_requests": false,
    },
    roleLabels: {
      "role.instructor": { singular: "Analyst", plural: "Analysts" },
    },
    entityLabels: {
      "entity.instructor": { singular: "Analyst", plural: "Analysts" },
    },
    defaultBucketTemplate: "analyst-default",
  },

  clinical_informatics: {
    key: "clinical_informatics",
    name: "Clinical informatics",
    description:
      "Strategy, build, and governance for clinical informatics teams. Classes and training planner off.",
    modules: {
      "module.classes": false,
      "module.training_planner": false,
      "module.education_requests": false,
    },
    roleLabels: {
      "role.instructor": { singular: "Informaticist", plural: "Informaticists" },
    },
    entityLabels: {
      "entity.instructor": { singular: "Informaticist", plural: "Informaticists" },
    },
    defaultBucketTemplate: "informatics-default",
  },

  software_engineering: {
    key: "software_engineering",
    name: "Software engineering",
    description:
      "Engineering teams tracking allocation across features, tech debt, oncall, and meetings.",
    modules: {
      "module.classes": false,
      "module.training_planner": false,
      "module.education_requests": false,
    },
    roleLabels: {
      "role.instructor": { singular: "Engineer", plural: "Engineers" },
    },
    entityLabels: {
      "entity.instructor": { singular: "Engineer", plural: "Engineers" },
    },
    defaultBucketTemplate: "engineering-default",
  },

  consulting: {
    key: "consulting",
    name: "Consulting firm",
    description:
      "Project-based services. Engagement intake enabled. Bucket categories track billable vs internal — not a billing system.",
    modules: {
      "module.classes": false,
      "module.training_planner": false,
      "module.education_requests": true,
    },
    roleLabels: {
      "role.instructor": { singular: "Consultant", plural: "Consultants" },
    },
    entityLabels: {
      "entity.instructor": { singular: "Consultant", plural: "Consultants" },
    },
    defaultBucketTemplate: "consulting-default",
  },

  creative_agency: {
    key: "creative_agency",
    name: "Creative agency",
    description: "Production and creative studios. Brief intake enabled; classes and planner off.",
    modules: {
      "module.classes": false,
      "module.training_planner": false,
      "module.education_requests": true,
    },
    roleLabels: {
      "role.instructor": { singular: "Producer", plural: "Producers" },
    },
    entityLabels: {
      "entity.instructor": { singular: "Producer", plural: "Producers" },
    },
    defaultBucketTemplate: "agency-default",
  },

  custom: {
    key: "custom",
    name: "Custom",
    description:
      "Start blank. Configure modules and labels manually. Use this when none of the presets fit.",
    modules: {
      "module.classes": false,
      "module.training_planner": false,
      "module.education_requests": false,
    },
    roleLabels: {},
    entityLabels: {},
    defaultBucketTemplate: null,
  },
};

export const PRESET_LIST: WorkspacePreset[] = Object.values(PRESETS);

const VALID_KEYS: ReadonlySet<PresetKey> = new Set([
  "hospital_training",
  "corporate_ld",
  "emr_analyst",
  "clinical_informatics",
  "software_engineering",
  "consulting",
  "creative_agency",
  "custom",
]);

export function getPreset(key: string): WorkspacePreset {
  // Fall back to hospital_training if an unknown key is passed (e.g. a
  // newly-shipped preset key seen by an out-of-date client). Hospital
  // training is the safest fallback because every module is on.
  if (!VALID_KEYS.has(key as PresetKey)) {
    return PRESETS.hospital_training;
  }
  return PRESETS[key as PresetKey];
}
