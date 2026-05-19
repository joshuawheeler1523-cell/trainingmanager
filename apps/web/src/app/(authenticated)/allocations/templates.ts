// Allocation bucket templates grounded in industry benchmarks.
//
// Sources:
//   • ATD State of the Industry 2024/2025 — L&D team time allocation patterns
//   • ANPD Nursing Professional Development Scope & Standards 3rd ed. (2022)
//   • AONL / AONE workforce briefs on hospital education team structure
//   • HIMSS Nursing Informatics Workforce Survey (2022)
//   • AMIA/ANA Nursing Informatics Scope & Standards 3rd ed.
//   • The Joint Commission Survey Process Guide (2026), ANCC Magnet manual
//   • Epic UserWeb principal-trainer / application-coordinator JDs (UMass
//     Memorial, Evergreen, University of Miami, CHRISTUS)
//   • BLS Occupational Outlook Handbook (13-1121, 13-1151)
//   • O*NET 13-1151.00 Training & Development Specialists
//   • NAM EHR Optimization and Clinician Well-Being (2020)
//   • 314e, CereCore, HIMSS NorCal EHR implementation guides
//
// Each template defines a complete slate of buckets — name, color, and
// percent. Applying a template archives all existing org buckets and
// creates this slate fresh, so percentages total exactly 100% against
// the template's own bucket set.

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
  directTraining: "#1F4D3A", // dark green — teaching / delivery
  courseDevelopment: "#8FA68E", // sage — design / content
  administrative: "#6B6B68", // gray — meetings / admin
  compliance: "#D4A574", // amber — compliance / audit
  pto: "#9CA3AF", // light gray — PTO
  projects: "#4A6B8A", // blue — project / implementation
  support: "#4D7C8E", // teal-blue — support / rounding
  governance: "#6B5B95", // muted purple — governance / committees
  build: "#B5651D", // terracotta — build / config
  people: "#C97B63", // warm clay — people / coaching
  analytics: "#4A8A6B", // sage-teal — data / analytics / QA
} as const;

export const BUCKET_TEMPLATES: BucketTemplate[] = [
  // ── Hospital training teams ──────────────────────────────────────────
  {
    id: "balanced",
    label: "Balanced hospital educator",
    description:
      "ATD-aligned baseline for a clinical educator: half on direct teaching, a fifth on course development, the rest split across admin, compliance, and non-productive time. Generic starting point if no other template fits.",
    buckets: [
      {
        name: "Direct Training",
        description: "Bedside instruction, classroom delivery, simulation, BLS/ACLS cohorts.",
        color: COLORS.directTraining,
        percent: 50,
      },
      {
        name: "Course Development",
        description: "Curriculum design, eLearning authoring, simulation scripts, job aids.",
        color: COLORS.courseDevelopment,
        percent: 20,
      },
      {
        name: "Administrative",
        description: "Meetings, scheduling, hiring, vendor management, reporting, budget.",
        color: COLORS.administrative,
        percent: 15,
      },
      {
        name: "Compliance & Audits",
        description: "Joint Commission prep, Magnet redesignation, mandatory training audits.",
        color: COLORS.compliance,
        percent: 10,
      },
      {
        name: "PTO / Non-productive",
        description: "Paid time off, holidays, sick days, conference travel, non-productive hours.",
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  {
    id: "direct-delivery",
    label: "Hospital instructors (direct delivery)",
    description:
      "Clinical nurse educators, ACLS/BLS/PALS instructors, simulation center staff, bedside coaches. Day is mostly teaching — classroom, simulation, and at-the-elbow on the unit. Vocabulary follows ANPD Scope & Standards 3rd ed. plus sim-coordinator JDs from Cleveland Clinic, Mayo, Emory.",
    buckets: [
      {
        name: "Classroom & Skills Lab",
        description: "Instructor-led cohorts: BLS/ACLS/PALS, orientation, annual skills fairs.",
        color: COLORS.directTraining,
        percent: 35,
      },
      {
        name: "Bedside Coaching",
        description:
          "At-the-elbow teaching on the unit, preceptor support, real-time clinical feedback.",
        color: COLORS.support,
        percent: 20,
      },
      {
        name: "Simulation & Debrief",
        description:
          "Scenario setup, sim run-time, structured debriefing, manikin / standardized patient coordination.",
        color: COLORS.people,
        percent: 15,
      },
      {
        name: "Competency Assessment",
        description:
          "Skills check-offs, return demonstrations, orientation sign-offs, competency tracking.",
        color: COLORS.analytics,
        percent: 10,
      },
      {
        name: "Prep & Materials",
        description:
          "Pulling slides, room setup, last-mile content adjustments, learner communications.",
        color: COLORS.courseDevelopment,
        percent: 8,
      },
      {
        name: "Admin & Meetings",
        description: "Unit huddles, scheduling, LMS rostering, council attendance.",
        color: COLORS.administrative,
        percent: 7,
      },
      {
        name: "PTO / Non-productive",
        description: "Vacation, holidays, sick, conference travel.",
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  {
    id: "course-developer",
    label: "Hospital developers (instructional design)",
    description:
      "eLearning authors, simulation script writers, curriculum designers, SCORM/video producers. Mostly heads-down content building with regular SME loops. Vocabulary follows ATD instructional-design process and ANPD Standard 5 (Planning).",
    buckets: [
      {
        name: "eLearning & Module Build",
        description: "Storyline/Rise/Captivate authoring, SCORM packaging, video production.",
        color: COLORS.courseDevelopment,
        percent: 35,
      },
      {
        name: "Curriculum Design",
        description: "Needs analysis, learning objectives, blueprints, storyboards.",
        color: COLORS.build,
        percent: 20,
      },
      {
        name: "SME Reviews & Revisions",
        description: "Working with clinical SMEs, legal/compliance review, revision cycles.",
        color: COLORS.people,
        percent: 15,
      },
      {
        name: "Pilot Delivery & QA",
        description: "Pilot teaching, learner feedback, A/B testing, accessibility QA.",
        color: COLORS.directTraining,
        percent: 10,
      },
      {
        name: "LMS & Content Ops",
        description: "Versioning, retirement, metadata, deployment to LMS, link maintenance.",
        color: COLORS.analytics,
        percent: 8,
      },
      {
        name: "Admin & Meetings",
        description: "Project planning, intake meetings, status reports, vendor calls.",
        color: COLORS.administrative,
        percent: 7,
      },
      {
        name: "PTO / Non-productive",
        description: "Vacation, holidays, sick, conference travel.",
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  {
    id: "training-leadership",
    label: "Hospital training leadership",
    description:
      "Directors of nursing education, training managers, education coordinators. Run the team, manage vendors, report to CNO/CMO. Vocabulary follows AONL Nurse Manager Competencies, BLS 13-1121 (Training & Development Managers), and ANPD Standard 12 (Leadership).",
    buckets: [
      {
        name: "People Management",
        description: "Hiring, performance reviews, 1:1s, team scheduling, conflict resolution.",
        color: COLORS.people,
        percent: 22,
      },
      {
        name: "Strategy & Planning",
        description: "Annual education plan, capacity forecasting, board/CNO reporting.",
        color: COLORS.governance,
        percent: 15,
      },
      {
        name: "Project Oversight",
        description:
          "Cross-functional initiatives, EHR/equipment rollouts, residency program oversight.",
        color: COLORS.projects,
        percent: 15,
      },
      {
        name: "Compliance & Audits",
        description:
          "Joint Commission readiness, CMS, state board reporting, mandatory training rollup.",
        color: COLORS.compliance,
        percent: 13,
      },
      {
        name: "Committee & Governance",
        description: "Nursing council, shared governance, Magnet/Pathway committees.",
        color: COLORS.support,
        percent: 13,
      },
      {
        name: "Budget & Vendor Management",
        description: "Contracts, RFPs, LMS/sim vendor renewals, P&L oversight.",
        color: COLORS.administrative,
        percent: 12,
      },
      {
        name: "Direct Training",
        description:
          "Occasional teaching, executive briefings, new-hire welcomes — keeps clinical credibility.",
        color: COLORS.directTraining,
        percent: 5,
      },
      {
        name: "PTO / Non-productive",
        description: "Vacation, holidays, sick, conference travel.",
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  // ── Hospital tech / informatics teams ────────────────────────────────
  {
    id: "emr-analyst",
    label: "EMR analyst team",
    description:
      "Epic/Cerner build analysts — Application Coordinators, Principal Trainers, Credentialed Trainers. Steady-state pattern: build + optimization + ticket resolution, with regular testing across Model/POC/PRD environments. Vocabulary synthesized from UMass Memorial, Evergreen, University of Miami, and CHRISTUS JDs and KLAS Research training-hour benchmarks.",
    buckets: [
      {
        name: "Build & Configuration",
        description:
          "Master files, build records, security templates, print groups, workflow build.",
        color: COLORS.build,
        percent: 30,
      },
      {
        name: "Optimization & Enhancements",
        description:
          "Post-go-live tickets, workflow improvements, sprint backlog, NOVA/feature requests.",
        color: COLORS.projects,
        percent: 15,
      },
      {
        name: "Testing & Validation",
        description: "Unit, integrated, parallel, regression testing across environments.",
        color: COLORS.analytics,
        percent: 13,
      },
      {
        name: "Training & Credentialing",
        description: "Curriculum updates, EUPA prep, EUPA grading, credentialing classes.",
        color: COLORS.directTraining,
        percent: 12,
      },
      {
        name: "Meetings & Governance",
        description: "Standups, change advisory board, workgroups, vendor calls, release planning.",
        color: COLORS.governance,
        percent: 12,
      },
      {
        name: "End-User Support",
        description: "Tier 2/3 ticket resolution, super-user escalations, downtime support.",
        color: COLORS.support,
        percent: 10,
      },
      {
        name: "PTO / Non-productive",
        description: "Vacation, holidays, sick, Epic UGM/XGM travel.",
        color: COLORS.pto,
        percent: 8,
      },
    ],
  },
  {
    id: "clinical-informatics",
    label: "Hospital clinical informatics",
    description:
      "Nursing Informatics Specialists, CMIO/CNIO support staff, informatics consultants. Translators between clinical and IT — not builders. Vocabulary follows AMIA/ANA Nursing Informatics Scope & Standards 3rd ed., HIMSS 2022 Nursing Informatics Workforce Survey, and the NAM EHR Optimization paper (2020).",
    buckets: [
      {
        name: "Workflow Analysis & Optimization",
        description: "Current/future state mapping, workflow observation, gap analysis with units.",
        color: COLORS.projects,
        percent: 25,
      },
      {
        name: "Clinical Rounding & Support",
        description: "Unit rounding, super-user support, real-time clinician troubleshooting.",
        color: COLORS.support,
        percent: 15,
      },
      {
        name: "Governance & Committees",
        description: "CNIO/CMIO councils, change advisory board, policy & standard work review.",
        color: COLORS.governance,
        percent: 15,
      },
      {
        name: "Project & Implementation Work",
        description:
          "Module rollouts, device deployments, integration projects, at-the-elbow leadership.",
        color: COLORS.build,
        percent: 13,
      },
      {
        name: "Data & Quality Reporting",
        description: "Dashboard design, quality metric validation, regulatory/Magnet data pulls.",
        color: COLORS.analytics,
        percent: 12,
      },
      {
        name: "Education & Translation",
        description:
          "Translating IT to clinical (and back), super-user training, change communications.",
        color: COLORS.courseDevelopment,
        percent: 12,
      },
      {
        name: "PTO / Non-productive",
        description: "Vacation, holidays, sick, conference travel (HIMSS, AMIA).",
        color: COLORS.pto,
        percent: 8,
      },
    ],
  },
  // ── Situational templates (during a rollout / regulatory cycle) ──────
  {
    id: "implementation",
    label: "Implementation rollout (EHR / program launch)",
    description:
      "For teams in the build-heavy phase of a major rollout — EHR migration, joint replacement program launch, robotics service line. Months 1–6 of a project: heavy curriculum build, then a compressed peak of classroom + at-the-elbow. Vocabulary follows 314e, CereCore, and HIMSS NorCal EHR implementation guides.",
    buckets: [
      {
        name: "Curriculum Build",
        description: "Course design, EUPA build, training environment data, quick-start guides.",
        color: COLORS.build,
        percent: 30,
      },
      {
        name: "Classroom Delivery",
        description: "Pre-go-live cohorts, role-based classes, super-user training.",
        color: COLORS.directTraining,
        percent: 20,
      },
      {
        name: "At-the-Elbow Support",
        description: "Go-live floor support, command center coverage, just-in-time coaching.",
        color: COLORS.support,
        percent: 15,
      },
      {
        name: "Project Coordination",
        description:
          "Implementation team meetings, milestone tracking, training environment management.",
        color: COLORS.projects,
        percent: 12,
      },
      {
        name: "Communications & Change",
        description: "Email cadence, FAQ maintenance, leader briefings, town halls.",
        color: COLORS.people,
        percent: 8,
      },
      {
        name: "Testing & Dress Rehearsals",
        description: "Workflow validation, integrated testing, mock go-lives, super-user prep.",
        color: COLORS.analytics,
        percent: 8,
      },
      {
        name: "PTO / Non-productive",
        description:
          "Vacation, holidays, sick — held lower because go-live blackout windows are common.",
        color: COLORS.pto,
        percent: 7,
      },
    ],
  },
  {
    id: "compliance",
    label: "Compliance-heavy (Joint Commission / Magnet)",
    description:
      "For environments preparing for The Joint Commission survey, Magnet redesignation, or CMS audits. Roughly half of capacity goes to regulatory work in the 12 months before a survey window. Vocabulary follows The Joint Commission Survey Process Guide (2026), the ANCC Magnet manual, and OIG Compliance Program Guidance (2023).",
    buckets: [
      {
        name: "Mandatory Training Delivery",
        description: "Annual compliance modules, HIPAA, EMTALA, fire/safety, restraints.",
        color: COLORS.directTraining,
        percent: 25,
      },
      {
        name: "Audit & Evidence Prep",
        description: "Source-of-evidence binders, competency file audits, Magnet documents.",
        color: COLORS.compliance,
        percent: 15,
      },
      {
        name: "Mock Surveys & Tracers",
        description: "Tracer methodology rounds, mock JC visits, ANCC site-visit prep.",
        color: COLORS.analytics,
        percent: 15,
      },
      {
        name: "Policy & Standards",
        description: "Standard work updates, policy revisions to match TJC/CMS changes.",
        color: COLORS.governance,
        percent: 12,
      },
      {
        name: "Course Development",
        description: "New modules to close audit findings, role-based competency materials.",
        color: COLORS.courseDevelopment,
        percent: 12,
      },
      {
        name: "Reporting & Dashboards",
        description: "Compliance %, completion dashboards, regulator-facing reports.",
        color: COLORS.projects,
        percent: 10,
      },
      {
        name: "Admin & Meetings",
        description: "Survey readiness committee, accreditation huddles, vendor calls.",
        color: COLORS.administrative,
        percent: 6,
      },
      {
        name: "PTO / Non-productive",
        description: "Vacation, holidays, sick — held lower because survey windows constrain PTO.",
        color: COLORS.pto,
        percent: 5,
      },
    ],
  },
  // ── Non-healthcare baseline ──────────────────────────────────────────
  {
    id: "corporate-ld",
    label: "Corporate L&D (non-healthcare)",
    description:
      "Generic enterprise L&D in finance, tech, retail, manufacturing. Less compliance heat than healthcare, more weight on coaching and business-consulting partnerships. Vocabulary follows ATD 2024/2025 State of the Industry, BLS 13-1151, and O*NET work activities.",
    buckets: [
      {
        name: "Training Delivery",
        description: "ILT, VILT, workshops, onboarding sessions, leadership cohorts.",
        color: COLORS.directTraining,
        percent: 30,
      },
      {
        name: "Content Design & Development",
        description: "Internal builds, SME interviews, materials authoring, video.",
        color: COLORS.courseDevelopment,
        percent: 22,
      },
      {
        name: "Coaching & Consulting",
        description: "Business partner intake, manager office hours, performance consulting.",
        color: COLORS.people,
        percent: 12,
      },
      {
        name: "LMS & Vendor Management",
        description: "LMS admin, content vendor SOWs, license tracking, integrations.",
        color: COLORS.governance,
        percent: 10,
      },
      {
        name: "Admin & Meetings",
        description: "Team meetings, scheduling, budget, status reporting, planning.",
        color: COLORS.administrative,
        percent: 10,
      },
      {
        name: "Evaluation & Analytics",
        description: "Kirkpatrick L1–L4, post-training surveys, dashboards, ROI reporting.",
        color: COLORS.analytics,
        percent: 8,
      },
      {
        name: "PTO / Non-productive",
        description: "Vacation, holidays, sick, conference travel.",
        color: COLORS.pto,
        percent: 8,
      },
    ],
  },
];
