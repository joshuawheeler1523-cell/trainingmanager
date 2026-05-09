// Allocation bucket templates grounded in industry benchmarks.
//
// Sources:
//   • ATD State of the Industry — typical L&D time allocation patterns
//   • ANCC / nursing professional development specialist scope of practice
//   • AONL workforce planning briefs on hospital education team structure
//   • Common JD breakdowns for "Clinical Nurse Educator" / "Education
//     Coordinator" / "Implementation Educator"
//
// Each template defines a complete slate of buckets — name, color, and
// percent. Applying a template archives all existing org buckets and
// creates this slate fresh, so percentages are guaranteed to total 100%
// against the template's own bucket set.

export type TemplateBucket = {
  name: string;
  description: string;
  color: string; // #RRGGBB
  percent: number; // 0-100
};

export type BucketTemplate = {
  id: string;
  label: string;
  description: string;
  buckets: TemplateBucket[];
};

const COLORS = {
  directTraining: "#1F4D3A",
  courseDevelopment: "#8FA68E",
  administrative: "#6B6B68",
  compliance: "#D4A574",
  pto: "#9CA3AF",
  projects: "#4A6B8A",
} as const;

const DESCRIPTIONS = {
  directTraining: "Bedside instruction, classroom delivery, simulation, BLS/ACLS cohorts.",
  courseDevelopment: "Curriculum design, eLearning authoring, simulation scripts, job aids.",
  administrative: "Meetings, scheduling, hiring, vendor management, reporting, budget.",
  compliance: "Joint Commission prep, Magnet redesignation, mandatory training audits.",
  pto: "Paid time off, holidays, sick days, conference travel, non-productive hours.",
  projects: "Special projects and program oversight (rollouts, vendor implementations).",
} as const;

export const BUCKET_TEMPLATES: BucketTemplate[] = [
  {
    id: "balanced",
    label: "Balanced hospital educator",
    description:
      "ATD-aligned baseline for a clinical educator: half on direct teaching, a fifth on course development, the rest split across admin, compliance, and non-productive time.",
    buckets: [
      {
        name: "Direct Training",
        description: DESCRIPTIONS.directTraining,
        color: COLORS.directTraining,
        percent: 50,
      },
      {
        name: "Course Development",
        description: DESCRIPTIONS.courseDevelopment,
        color: COLORS.courseDevelopment,
        percent: 20,
      },
      {
        name: "Administrative",
        description: DESCRIPTIONS.administrative,
        color: COLORS.administrative,
        percent: 15,
      },
      {
        name: "Compliance & Audits",
        description: DESCRIPTIONS.compliance,
        color: COLORS.compliance,
        percent: 10,
      },
      {
        name: "PTO / Non-productive",
        description: DESCRIPTIONS.pto,
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  {
    id: "implementation",
    label: "Implementation-focused",
    description:
      "Tilted toward course development for teams in the middle of a major rollout (EHR migration, joint replacement program launch, etc.). Less direct delivery while curriculum is being built.",
    buckets: [
      {
        name: "Direct Training",
        description: DESCRIPTIONS.directTraining,
        color: COLORS.directTraining,
        percent: 30,
      },
      {
        name: "Course Development",
        description: DESCRIPTIONS.courseDevelopment,
        color: COLORS.courseDevelopment,
        percent: 35,
      },
      {
        name: "Administrative",
        description: DESCRIPTIONS.administrative,
        color: COLORS.administrative,
        percent: 15,
      },
      {
        name: "Compliance & Audits",
        description: DESCRIPTIONS.compliance,
        color: COLORS.compliance,
        percent: 10,
      },
      {
        name: "PTO / Non-productive",
        description: DESCRIPTIONS.pto,
        color: COLORS.pto,
        percent: 10,
      },
    ],
  },
  {
    id: "compliance",
    label: "Compliance-heavy",
    description:
      "For environments preparing for The Joint Commission survey, Magnet redesignation, or other regulatory cycles. A quarter of capacity is committed to audits and required documentation.",
    buckets: [
      {
        name: "Direct Training",
        description: DESCRIPTIONS.directTraining,
        color: COLORS.directTraining,
        percent: 40,
      },
      {
        name: "Course Development",
        description: DESCRIPTIONS.courseDevelopment,
        color: COLORS.courseDevelopment,
        percent: 15,
      },
      {
        name: "Administrative",
        description: DESCRIPTIONS.administrative,
        color: COLORS.administrative,
        percent: 15,
      },
      {
        name: "Compliance & Audits",
        description: DESCRIPTIONS.compliance,
        color: COLORS.compliance,
        percent: 25,
      },
      {
        name: "PTO / Non-productive",
        description: DESCRIPTIONS.pto,
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  {
    id: "direct-delivery",
    label: "Direct delivery team",
    description:
      "Lean teams whose primary mandate is teaching — bedside skills, simulation, BLS/ACLS cohorts. Course development is light because curriculum is largely off-the-shelf or vendor-supplied.",
    buckets: [
      {
        name: "Direct Training",
        description: DESCRIPTIONS.directTraining,
        color: COLORS.directTraining,
        percent: 65,
      },
      {
        name: "Course Development",
        description: DESCRIPTIONS.courseDevelopment,
        color: COLORS.courseDevelopment,
        percent: 10,
      },
      {
        name: "Administrative",
        description: DESCRIPTIONS.administrative,
        color: COLORS.administrative,
        percent: 10,
      },
      {
        name: "Compliance & Audits",
        description: DESCRIPTIONS.compliance,
        color: COLORS.compliance,
        percent: 10,
      },
      {
        name: "PTO / Non-productive",
        description: DESCRIPTIONS.pto,
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  {
    id: "training-leadership",
    label: "Training leadership",
    description:
      "For directors, managers, and coordinators running the team. Most time goes to admin (meetings, hiring, vendor management, budget) and project oversight; occasional teaching keeps clinical credibility.",
    buckets: [
      {
        name: "Administrative",
        description: DESCRIPTIONS.administrative,
        color: COLORS.administrative,
        percent: 40,
      },
      {
        name: "Project Oversight",
        description: DESCRIPTIONS.projects,
        color: COLORS.projects,
        percent: 25,
      },
      {
        name: "Compliance & Audits",
        description: DESCRIPTIONS.compliance,
        color: COLORS.compliance,
        percent: 15,
      },
      {
        name: "Course Development",
        description: DESCRIPTIONS.courseDevelopment,
        color: COLORS.courseDevelopment,
        percent: 10,
      },
      {
        name: "Direct Training",
        description: DESCRIPTIONS.directTraining,
        color: COLORS.directTraining,
        percent: 5,
      },
      {
        name: "PTO / Non-productive",
        description: DESCRIPTIONS.pto,
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  {
    id: "course-developer",
    label: "Education developer / instructional designer",
    description:
      "For content creators — eLearning module builds, simulation scripts, job aids, video and SCORM authoring. Most time is heads-down design; minimal direct teaching beyond occasional content pilots.",
    buckets: [
      {
        name: "Course Development",
        description: DESCRIPTIONS.courseDevelopment,
        color: COLORS.courseDevelopment,
        percent: 70,
      },
      {
        name: "Direct Training",
        description: DESCRIPTIONS.directTraining,
        color: COLORS.directTraining,
        percent: 10,
      },
      {
        name: "Administrative",
        description: DESCRIPTIONS.administrative,
        color: COLORS.administrative,
        percent: 10,
      },
      {
        name: "Compliance & Audits",
        description: DESCRIPTIONS.compliance,
        color: COLORS.compliance,
        percent: 5,
      },
      {
        name: "PTO / Non-productive",
        description: DESCRIPTIONS.pto,
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
];
