/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition -- seed action uses lookup maps populated immediately above each access; missing keys would mean schema drift, not data we need to handle gracefully. The unnecessary-condition checks fight the defensive runtime guards we keep around Supabase responses. */
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const DEMO_ORG_SLUG = "riverside-memorial-hospital";
const DEMO_ORG_NAME = "Riverside Memorial Hospital";

export type SeedResult =
  | { ok: true; orgId: string; counts: Record<string, number> }
  | { ok: false; error: string };

export async function seedDemoOrg(): Promise<SeedResult> {
  // Caller must be authed — they'll be granted manager on the new org.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    // ── 1. Drop any existing demo org (cascade clears child rows) ────────
    await admin.from("organizations").delete().eq("slug", DEMO_ORG_SLUG);

    // ── 2. Create the org + caller membership ────────────────────────────
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name: DEMO_ORG_NAME, slug: DEMO_ORG_SLUG })
      .select("id")
      .single();
    if (orgErr || !org) throw new Error(`Create org: ${orgErr?.message ?? "no row"}`);
    const orgId = org.id;

    // Create the General department for this org and the caller's
    // department membership. Every seeded record below is scoped to
    // this department.
    const { data: dept, error: deptErr } = await admin
      .from("departments")
      .insert({
        org_id: orgId,
        name: "General",
        slug: "general",
        description: "Default department — created with the org.",
      })
      .select("id")
      .single();
    if (deptErr || !dept) throw new Error(`Create department: ${deptErr?.message ?? "no row"}`);
    const deptId = dept.id;

    // org_memberships is org-scoped — does NOT take department_id.
    const { error: memErr } = await admin.from("org_memberships").insert({
      org_id: orgId,
      user_id: user.id,
      role: "manager",
      accepted_at: new Date().toISOString(),
    });
    if (memErr) throw new Error(`Create membership: ${memErr.message}`);

    const { error: deptMemErr } = await admin.from("department_memberships").insert({
      department_id: deptId,
      user_id: user.id,
      role: "department_admin",
      accepted_at: new Date().toISOString(),
    });
    if (deptMemErr) throw new Error(`Create department membership: ${deptMemErr.message}`);

    // ── 3. Skills ────────────────────────────────────────────────────────
    const skillSeeds = [
      { name: "Epic EHR", category: "Clinical Systems", is_certification: false },
      { name: "Cerner Millennium", category: "Clinical Systems", is_certification: false },
      { name: "Adult ACLS", category: "Certification", is_certification: true },
      { name: "BLS / CPR", category: "Certification", is_certification: true },
      { name: "Surgical Robotics (da Vinci)", category: "Procedural", is_certification: false },
      { name: "Trauma & Code Response", category: "Clinical Skills", is_certification: false },
      { name: "Pediatric Critical Care", category: "Clinical Skills", is_certification: false },
      { name: "Adult Learning Theory", category: "Education", is_certification: false },
    ];
    const { data: skills, error: skillErr } = await admin
      .from("skills")
      .insert(skillSeeds.map((s) => ({ ...s, org_id: orgId, department_id: deptId })))
      .select("id, name");
    if (skillErr || !skills) throw new Error(`Skills: ${skillErr?.message ?? "no rows"}`);
    const skillByName = new Map(skills.map((s) => [s.name, s.id]));

    // ── 4. Instructors ───────────────────────────────────────────────────
    // Every instructor is full-time (2080h annual = 40h/wk × 52wk). Variance
    // in utilization% comes from how much WORK each is assigned downstream
    // (classes, projects, requests, tasks), not from capacity. The demo
    // story: two over-allocated leads, two at-risk, six balanced, four
    // under-utilized — populated by deliberate work concentration below.
    const instructorSeeds: { full_name: string; department: string; annual_hours: number }[] = [
      { full_name: "Maya Castellanos", department: "Nursing Education", annual_hours: 2080 },
      { full_name: "Devon Park", department: "Nursing Education", annual_hours: 2080 },
      { full_name: "Aisha Bello", department: "Nursing Education", annual_hours: 2080 },
      { full_name: "Tomás Rivera", department: "Clinical Informatics", annual_hours: 2080 },
      { full_name: "Sasha Petrov", department: "Clinical Informatics", annual_hours: 2080 },
      { full_name: "Priya Chandrasekaran", department: "Surgery", annual_hours: 2080 },
      { full_name: "Marcus Webb", department: "Surgery", annual_hours: 2080 },
      { full_name: "Hannah O'Connor", department: "Emergency", annual_hours: 2080 },
      { full_name: "Reggie Strand", department: "Emergency", annual_hours: 2080 },
      { full_name: "Nadia Haddad", department: "Pediatrics", annual_hours: 2080 },
      { full_name: "Quentin Reyes", department: "Compliance & Quality", annual_hours: 2080 },
      { full_name: "Linnea Forsberg", department: "Compliance & Quality", annual_hours: 2080 },
    ];
    const { data: instructors, error: instErr } = await admin
      .from("instructors")
      .insert(
        instructorSeeds.map((i) => ({
          ...i,
          org_id: orgId,
          department_id: deptId,
          status: "active" as const,
        })),
      )
      .select("id, full_name, department");
    if (instErr || !instructors) throw new Error(`Instructors: ${instErr?.message ?? "no rows"}`);
    const instById = new Map(instructors.map((i) => [i.full_name, i]));

    // Skill assignments — one to three per instructor, biased to dept.
    // Certification skills carry expires_at so the skill-gap report's
    // expiring_certs panel populates. Spread urgencies (15d, 30d, 60d, 80d)
    // for visual variety; one expiry beyond the 90d window so we can verify
    // the cutoff works.
    type Prof = "beginner" | "intermediate" | "advanced" | "expert";
    type SkillAssign = {
      name: string;
      skill: string;
      prof: Prof;
      expiresInDays?: number;
    };
    const skillAssignments: SkillAssign[] = [
      { name: "Maya Castellanos", skill: "Epic EHR", prof: "expert" },
      { name: "Maya Castellanos", skill: "Adult Learning Theory", prof: "advanced" },
      { name: "Maya Castellanos", skill: "BLS / CPR", prof: "expert", expiresInDays: 60 },
      { name: "Devon Park", skill: "Cerner Millennium", prof: "advanced" },
      { name: "Devon Park", skill: "Adult Learning Theory", prof: "intermediate" },
      { name: "Aisha Bello", skill: "Epic EHR", prof: "advanced" },
      { name: "Aisha Bello", skill: "BLS / CPR", prof: "advanced", expiresInDays: 200 },
      { name: "Tomás Rivera", skill: "Epic EHR", prof: "expert" },
      { name: "Tomás Rivera", skill: "Cerner Millennium", prof: "expert" },
      { name: "Tomás Rivera", skill: "Adult ACLS", prof: "advanced", expiresInDays: 30 },
      { name: "Sasha Petrov", skill: "Epic EHR", prof: "intermediate" },
      { name: "Sasha Petrov", skill: "Adult Learning Theory", prof: "advanced" },
      {
        name: "Priya Chandrasekaran",
        skill: "Surgical Robotics (da Vinci)",
        prof: "expert",
      },
      {
        name: "Priya Chandrasekaran",
        skill: "Adult ACLS",
        prof: "expert",
        expiresInDays: 120, // outside the 90d window — won't show in expiring_certs
      },
      { name: "Marcus Webb", skill: "Surgical Robotics (da Vinci)", prof: "advanced" },
      { name: "Hannah O'Connor", skill: "Trauma & Code Response", prof: "expert" },
      {
        name: "Hannah O'Connor",
        skill: "Adult ACLS",
        prof: "expert",
        expiresInDays: 15, // urgent
      },
      { name: "Reggie Strand", skill: "Trauma & Code Response", prof: "advanced" },
      { name: "Reggie Strand", skill: "BLS / CPR", prof: "expert", expiresInDays: 80 },
      { name: "Nadia Haddad", skill: "Pediatric Critical Care", prof: "expert" },
      { name: "Nadia Haddad", skill: "BLS / CPR", prof: "advanced" },
      { name: "Quentin Reyes", skill: "Adult Learning Theory", prof: "intermediate" },
      { name: "Linnea Forsberg", skill: "Adult Learning Theory", prof: "advanced" },
    ];
    const isRows = skillAssignments
      .map((a) => {
        const inst = instById.get(a.name);
        const skillId = skillByName.get(a.skill);
        if (!inst || !skillId) return null;
        const row: {
          org_id: string;
          department_id: string;
          instructor_id: string;
          skill_id: string;
          proficiency: Prof;
          is_certified?: boolean;
          certified_at?: string;
          expires_at?: string;
        } = {
          org_id: orgId,
          department_id: deptId,
          instructor_id: inst.id,
          skill_id: skillId,
          proficiency: a.prof,
        };
        if (a.expiresInDays !== undefined) {
          row.is_certified = true;
          // Certified roughly 2 years ago (typical cert cycle); expires_at
          // is the demo-tunable.
          row.certified_at = addDaysIso(a.expiresInDays - 730);
          row.expires_at = addDaysIso(a.expiresInDays);
        }
        return row;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const { error: isErr } = await admin.from("instructor_skills").insert(isRows);
    if (isErr) throw new Error(`Instructor skills: ${isErr.message}`);

    // ── 5. Allocation buckets ────────────────────────────────────────────
    const bucketSeeds = [
      { name: "Direct Training", color: "#1F4D3A", display_order: 0 },
      { name: "Course Development", color: "#8FA68E", display_order: 1 },
      { name: "Administrative", color: "#6B6B68", display_order: 2 },
      { name: "Compliance & Audits", color: "#D4A574", display_order: 3 },
      { name: "PTO / Non-productive", color: "#9CA3AF", display_order: 4 },
    ];
    const { data: buckets, error: bucketErr } = await admin
      .from("allocation_buckets")
      .insert(bucketSeeds.map((b) => ({ ...b, org_id: orgId, department_id: deptId })))
      .select("id, name");
    if (bucketErr || !buckets) throw new Error(`Buckets: ${bucketErr?.message ?? "no rows"}`);
    const bucketByName = new Map(buckets.map((b) => [b.name, b.id]));

    // ── 6. Global allocations (must sum to 100%) ─────────────────────────
    const globalAllocs = [
      { bucketName: "Direct Training", percent: 50 },
      { bucketName: "Course Development", percent: 20 },
      { bucketName: "Administrative", percent: 15 },
      { bucketName: "Compliance & Audits", percent: 10 },
      { bucketName: "PTO / Non-productive", percent: 5 },
    ];
    const { error: gaErr } = await admin.from("global_allocations").insert(
      globalAllocs.map((g) => ({
        org_id: orgId,
        department_id: deptId,
        bucket_id: bucketByName.get(g.bucketName)!,
        target_percent: g.percent,
      })),
    );
    if (gaErr) throw new Error(`Global allocations: ${gaErr.message}`);

    // ── 7. Allocation groups + members + group-level overrides ───────────
    const { data: groups, error: groupErr } = await admin
      .from("allocation_groups")
      .insert([
        { org_id: orgId, department_id: deptId, name: "Surgical Education Team" },
        { org_id: orgId, department_id: deptId, name: "Emergency & Trauma Educators" },
      ])
      .select("id, name");
    if (groupErr || !groups) throw new Error(`Groups: ${groupErr?.message ?? "no rows"}`);
    const groupByName = new Map(groups.map((g) => [g.name, g.id]));

    const groupMembers = [
      { group: "Surgical Education Team", instructor: "Priya Chandrasekaran" },
      { group: "Surgical Education Team", instructor: "Marcus Webb" },
      { group: "Emergency & Trauma Educators", instructor: "Hannah O'Connor" },
      { group: "Emergency & Trauma Educators", instructor: "Reggie Strand" },
    ];
    await admin.from("allocation_group_members").insert(
      groupMembers.map((m) => ({
        org_id: orgId,
        department_id: deptId,
        group_id: groupByName.get(m.group)!,
        instructor_id: instById.get(m.instructor)!.id,
      })),
    );

    await admin.from("group_allocations").insert([
      // Surgical team — heavier on procedural / direct training
      {
        org_id: orgId,
        department_id: deptId,
        group_id: groupByName.get("Surgical Education Team")!,
        bucket_id: bucketByName.get("Direct Training")!,
        target_percent: 60,
      },
      {
        org_id: orgId,
        department_id: deptId,
        group_id: groupByName.get("Surgical Education Team")!,
        bucket_id: bucketByName.get("Course Development")!,
        target_percent: 25,
      },
      // Emergency team — heavier on direct training
      {
        org_id: orgId,
        department_id: deptId,
        group_id: groupByName.get("Emergency & Trauma Educators")!,
        bucket_id: bucketByName.get("Direct Training")!,
        target_percent: 65,
      },
    ]);

    // ── 8. Individual allocation override (one example) ──────────────────
    await admin.from("individual_allocations").insert([
      {
        org_id: orgId,
        department_id: deptId,
        instructor_id: instById.get("Quentin Reyes")!.id,
        bucket_id: bucketByName.get("Compliance & Audits")!,
        target_percent: 50,
      },
      {
        org_id: orgId,
        department_id: deptId,
        instructor_id: instById.get("Quentin Reyes")!.id,
        bucket_id: bucketByName.get("Direct Training")!,
        target_percent: 30,
      },
    ]);

    // ── 9. Recurring tasks + assignments ─────────────────────────────────
    const { data: recTasks } = await admin
      .from("recurring_tasks")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          name: "Weekly competency huddle",
          frequency: "weekly",
          hours_per_occurrence: 1,
          occurrences_per_year: 50,
          status: "active",
          bucket_id: bucketByName.get("Administrative")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          name: "Quarterly compliance audit prep",
          frequency: "quarterly",
          hours_per_occurrence: 8,
          occurrences_per_year: 4,
          status: "active",
          bucket_id: bucketByName.get("Compliance & Audits")!,
        },
      ])
      .select("id, name");
    if (recTasks) {
      const huddle = recTasks.find((r) => r.name.includes("huddle"));
      const audit = recTasks.find((r) => r.name.includes("audit"));
      const recAssigns = [
        ...(huddle
          ? [
              { recurring_task_id: huddle.id, name: "Maya Castellanos" },
              { recurring_task_id: huddle.id, name: "Devon Park" },
            ]
          : []),
        ...(audit ? [{ recurring_task_id: audit.id, name: "Quentin Reyes" }] : []),
      ];
      if (recAssigns.length > 0) {
        await admin.from("recurring_task_assignments").insert(
          recAssigns.map((r) => ({
            org_id: orgId,
            department_id: deptId,
            recurring_task_id: r.recurring_task_id,
            instructor_id: instById.get(r.name)!.id,
            share_percent: 100,
          })),
        );
      }
    }

    // ── 10. Ad-hoc tasks ─────────────────────────────────────────────────
    await admin.from("ad_hoc_tasks").insert([
      {
        org_id: orgId,
        department_id: deptId,
        name: "Update sepsis bundle order set training",
        hours: 6,
        status: "in_progress",
        bucket_id: bucketByName.get("Course Development")!,
        instructor_id: instById.get("Maya Castellanos")!.id,
        due_date: addDaysIso(14),
      },
      {
        org_id: orgId,
        department_id: deptId,
        name: "Pediatric pain assessment refresher",
        hours: 4,
        status: "open",
        bucket_id: bucketByName.get("Direct Training")!,
        instructor_id: instById.get("Nadia Haddad")!.id,
      },
      {
        org_id: orgId,
        department_id: deptId,
        name: "OR robotics quarterly recert",
        hours: 12,
        status: "open",
        bucket_id: bucketByName.get("Direct Training")!,
        instructor_id: instById.get("Priya Chandrasekaran")!.id,
        due_date: addDaysIso(30),
      },
    ]);

    // ── 11. Classes + skill requirements + instructor assignments ────────
    const { data: classes } = await admin
      .from("classes")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          name: "Epic EHR — Inpatient Nursing Bootcamp",
          total_days: 3,
          offerings_per_year: 30,
          prep_hours_per_offering: 4,
          logistics_hours_per_offering: 2,
          status: "active",
          hours_per_day: 8,
          allocation_bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          name: "Trauma Code Response Simulation",
          total_days: 1,
          offerings_per_year: 16,
          prep_hours_per_offering: 6,
          logistics_hours_per_offering: 4,
          status: "active",
          hours_per_day: 8,
          allocation_bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          name: "Pediatric Critical Care Refresher",
          total_days: 2,
          offerings_per_year: 6,
          prep_hours_per_offering: 3,
          logistics_hours_per_offering: 2,
          status: "active",
          hours_per_day: 8,
          allocation_bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          name: "da Vinci Robotics — Console Recert",
          total_days: 1,
          offerings_per_year: 8,
          prep_hours_per_offering: 4,
          logistics_hours_per_offering: 3,
          status: "active",
          hours_per_day: 8,
          allocation_bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          name: "BLS Provider — Quarterly Cohort",
          total_days: 1,
          offerings_per_year: 16,
          prep_hours_per_offering: 1,
          logistics_hours_per_offering: 1,
          status: "active",
          hours_per_day: 8,
          allocation_bucket_id: bucketByName.get("Direct Training")!,
        },
        // Pediatric Code Blue Sim — only Nadia is expert-qualified for
        // Pediatric Critical Care, so this class triggers skill-gap's
        // insufficient_coverage finding (qualified_count = 1 < threshold 2).
        {
          org_id: orgId,
          department_id: deptId,
          name: "Pediatric Code Blue Sim",
          total_days: 1,
          offerings_per_year: 6,
          prep_hours_per_offering: 4,
          logistics_hours_per_offering: 2,
          status: "active",
          hours_per_day: 4,
          allocation_bucket_id: bucketByName.get("Direct Training")!,
        },
      ])
      .select("id, name");
    if (!classes) throw new Error("Classes returned no rows");

    const classByName = new Map(classes.map((c) => [c.name, c.id]));

    await admin.from("class_skill_requirements").insert([
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Epic EHR — Inpatient Nursing Bootcamp")!,
        skill_id: skillByName.get("Epic EHR")!,
        min_proficiency: "advanced",
        requirement: "required",
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Trauma Code Response Simulation")!,
        skill_id: skillByName.get("Trauma & Code Response")!,
        min_proficiency: "expert",
        requirement: "required",
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Trauma Code Response Simulation")!,
        skill_id: skillByName.get("Adult ACLS")!,
        min_proficiency: "advanced",
        requirement: "preferred",
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Pediatric Critical Care Refresher")!,
        skill_id: skillByName.get("Pediatric Critical Care")!,
        min_proficiency: "expert",
        requirement: "required",
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("da Vinci Robotics — Console Recert")!,
        skill_id: skillByName.get("Surgical Robotics (da Vinci)")!,
        min_proficiency: "expert",
        requirement: "required",
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("BLS Provider — Quarterly Cohort")!,
        skill_id: skillByName.get("BLS / CPR")!,
        min_proficiency: "advanced",
        requirement: "required",
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Pediatric Code Blue Sim")!,
        skill_id: skillByName.get("Pediatric Critical Care")!,
        min_proficiency: "expert",
        requirement: "required",
      },
    ]);

    await admin.from("class_instructor_assignments").insert([
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Epic EHR — Inpatient Nursing Bootcamp")!,
        instructor_id: instById.get("Maya Castellanos")!.id,
        role: "primary",
        assigned_offerings: 18,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Epic EHR — Inpatient Nursing Bootcamp")!,
        instructor_id: instById.get("Aisha Bello")!.id,
        role: "backup",
        assigned_offerings: 6,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Trauma Code Response Simulation")!,
        instructor_id: instById.get("Hannah O'Connor")!.id,
        role: "primary",
        assigned_offerings: 8,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Trauma Code Response Simulation")!,
        instructor_id: instById.get("Reggie Strand")!.id,
        role: "backup",
        assigned_offerings: 4,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Pediatric Critical Care Refresher")!,
        instructor_id: instById.get("Nadia Haddad")!.id,
        role: "primary",
        assigned_offerings: 6,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("da Vinci Robotics — Console Recert")!,
        instructor_id: instById.get("Priya Chandrasekaran")!.id,
        role: "primary",
        assigned_offerings: 6,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("da Vinci Robotics — Console Recert")!,
        instructor_id: instById.get("Marcus Webb")!.id,
        role: "backup",
        assigned_offerings: 2,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("BLS Provider — Quarterly Cohort")!,
        instructor_id: instById.get("Reggie Strand")!.id,
        role: "primary",
        assigned_offerings: 12,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("BLS Provider — Quarterly Cohort")!,
        instructor_id: instById.get("Aisha Bello")!.id,
        role: "eligible",
        assigned_offerings: 4,
      },
      {
        org_id: orgId,
        department_id: deptId,
        class_id: classByName.get("Pediatric Code Blue Sim")!,
        instructor_id: instById.get("Nadia Haddad")!.id,
        role: "primary",
        assigned_offerings: 6,
      },
    ]);

    // ── 12. TRAs (4 statuses) + deliverables ─────────────────────────────
    const { data: deliverableTypes } = await admin
      .from("deliverable_types")
      .select("id, name")
      .or("is_built_in.eq.true,is_built_in.is.null");
    if (!deliverableTypes || deliverableTypes.length === 0) {
      throw new Error("No deliverable types found — seed migration must run first");
    }
    const dtByName = new Map(deliverableTypes.map((d) => [d.name, d.id]));
    const fallbackDtId = deliverableTypes[0]!.id;
    const dtId = (n: string): string => dtByName.get(n) ?? fallbackDtId;

    const { data: tras } = await admin
      .from("tras")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          project_name: "Sepsis Bundle Rollout — Phase 1",
          requesting_department: "Quality & Patient Safety",
          priority: "regulatory",
          status: "draft",
          business_problem:
            "Update inpatient training around the new sepsis bundle order set ahead of regulatory review.",
          total_estimated_hours: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_name: "Cerner-to-Epic Migration Education",
          requesting_department: "Clinical Informatics",
          priority: "important",
          status: "documented",
          business_problem:
            "12-week curriculum for inpatient nursing, ED, and surgical staff to migrate from Cerner to Epic.",
          total_estimated_hours: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_name: "Pediatric Pain Assessment Refresh",
          requesting_department: "Pediatrics",
          priority: "important",
          status: "documented",
          business_problem: "Quarterly refresher covering FLACC and CRIES tools.",
          total_estimated_hours: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_name: "Robotics Console Recertification",
          requesting_department: "Surgery",
          priority: "important",
          status: "converted",
          business_problem: "Quarterly recert for da Vinci console operators.",
          total_estimated_hours: 0,
        },
      ])
      .select("id, project_name");
    const traByName = new Map((tras ?? []).map((t) => [t.project_name, t.id]));

    if (deliverableTypes && deliverableTypes.length > 0 && tras) {
      await admin.from("tra_deliverables").insert([
        {
          org_id: orgId,
          department_id: deptId,
          tra_id: traByName.get("Sepsis Bundle Rollout — Phase 1")!,
          deliverable_type_id: dtId("eLearning Module"),
          name: "Sepsis bundle eLearning",
          quantity: 1,
          seat_time_hours: 1,
          complexity_multiplier: 1.0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          tra_id: traByName.get("Sepsis Bundle Rollout — Phase 1")!,
          deliverable_type_id: dtId("Job Aid"),
          name: "Order set quick-reference card",
          quantity: 1,
          seat_time_hours: 0.25,
          complexity_multiplier: 0.75,
        },
        {
          org_id: orgId,
          department_id: deptId,
          tra_id: traByName.get("Cerner-to-Epic Migration Education")!,
          deliverable_type_id: dtId("Instructor-Led Class"),
          name: "Inpatient Nursing Bootcamp (3-day)",
          quantity: 24,
          seat_time_hours: 24,
          complexity_multiplier: 1.5,
        },
        {
          org_id: orgId,
          department_id: deptId,
          tra_id: traByName.get("Cerner-to-Epic Migration Education")!,
          deliverable_type_id: dtId("Simulation"),
          name: "Code response sim w/ Epic flowsheets",
          quantity: 6,
          seat_time_hours: 4,
          complexity_multiplier: 2.0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          tra_id: traByName.get("Pediatric Pain Assessment Refresh")!,
          deliverable_type_id: dtId("eLearning Module"),
          name: "FLACC & CRIES refresher",
          quantity: 1,
          seat_time_hours: 0.75,
          complexity_multiplier: 1.0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          tra_id: traByName.get("Robotics Console Recertification")!,
          deliverable_type_id: dtId("Instructor-Led Class"),
          name: "Console recert lab",
          quantity: 6,
          seat_time_hours: 8,
          complexity_multiplier: 1.25,
        },
      ]);
    }

    // ── 13. Projects (one converted from a TRA) + tasks + team + milestones ─
    const { data: projects } = await admin
      .from("projects")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          name: "Cerner-to-Epic Migration Education",
          description:
            "End-to-end curriculum buildout and rollout for the Cerner → Epic migration.",
          status: "active",
          priority: "high",
          start_date: addDaysIso(-30),
          end_date: addDaysIso(120),
          source_tra_id: traByName.get("Cerner-to-Epic Migration Education") ?? null,
          bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          name: "Robotics Console Recertification — Q3",
          description: "Q3 recert wave for da Vinci console operators.",
          status: "planning",
          priority: "medium",
          start_date: addDaysIso(20),
          end_date: addDaysIso(80),
          source_tra_id: traByName.get("Robotics Console Recertification") ?? null,
          bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          name: "Pediatric Pain Assessment Refresh",
          description: "Quarterly Peds refresh with online module + huddle.",
          status: "completed",
          priority: "low",
          start_date: addDaysIso(-90),
          end_date: addDaysIso(-10),
          source_tra_id: traByName.get("Pediatric Pain Assessment Refresh") ?? null,
        },
      ])
      .select("id, name");
    if (!projects) throw new Error("Projects returned no rows");
    const projByName = new Map(projects.map((p) => [p.name, p.id]));

    // Project team — Cerner-to-Epic
    const { data: teamRows } = await admin
      .from("project_team_members")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          project_id: projByName.get("Cerner-to-Epic Migration Education")!,
          instructor_id: instById.get("Tomás Rivera")!.id,
          role: "lead",
          allocated_hours: 240,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: projByName.get("Cerner-to-Epic Migration Education")!,
          instructor_id: instById.get("Maya Castellanos")!.id,
          role: "member",
          allocated_hours: 160,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: projByName.get("Cerner-to-Epic Migration Education")!,
          instructor_id: instById.get("Devon Park")!.id,
          role: "member",
          allocated_hours: 120,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: projByName.get("Cerner-to-Epic Migration Education")!,
          instructor_id: instById.get("Hannah O'Connor")!.id,
          role: "reviewer",
          allocated_hours: 40,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: projByName.get("Robotics Console Recertification — Q3")!,
          instructor_id: instById.get("Priya Chandrasekaran")!.id,
          role: "lead",
          allocated_hours: 80,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: projByName.get("Robotics Console Recertification — Q3")!,
          instructor_id: instById.get("Marcus Webb")!.id,
          role: "member",
          allocated_hours: 40,
        },
      ])
      .select("id, project_id, instructor_id, role");

    // Milestones for Cerner-to-Epic
    const cernerProjId = projByName.get("Cerner-to-Epic Migration Education")!;
    await admin.from("milestones").insert([
      {
        org_id: orgId,
        department_id: deptId,
        project_id: cernerProjId,
        name: "Curriculum approved",
        // Intentionally past — drives the "Overdue milestones" dashboard widget.
        due_date: addDaysIso(-5),
        is_complete: false,
        sort_order: 0,
      },
      {
        org_id: orgId,
        department_id: deptId,
        project_id: cernerProjId,
        name: "First cohort complete",
        due_date: addDaysIso(45),
        is_complete: false,
        sort_order: 1,
      },
      {
        org_id: orgId,
        department_id: deptId,
        project_id: cernerProjId,
        name: "Go-live training complete",
        due_date: addDaysIso(110),
        is_complete: false,
        sort_order: 2,
      },
    ]);

    // Tasks for Cerner-to-Epic
    const { data: taskRows } = await admin
      .from("tasks")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          project_id: cernerProjId,
          name: "Curriculum design + outline",
          status: "completed",
          priority: "high",
          estimated_hours: 40,
          percent_complete: 100,
          start_date: addDaysIso(-25),
          end_date: addDaysIso(-10),
          sort_order: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: cernerProjId,
          name: "Build inpatient bootcamp deck",
          status: "in_progress",
          priority: "high",
          estimated_hours: 60,
          percent_complete: 60,
          start_date: addDaysIso(-9),
          end_date: addDaysIso(7),
          sort_order: 1,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: cernerProjId,
          name: "Build ED & surgical decks",
          status: "in_progress",
          priority: "medium",
          estimated_hours: 50,
          percent_complete: 25,
          start_date: addDaysIso(-3),
          end_date: addDaysIso(20),
          sort_order: 2,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: cernerProjId,
          name: "Schedule cohort sessions",
          status: "not_started",
          priority: "medium",
          estimated_hours: 16,
          percent_complete: 0,
          start_date: addDaysIso(15),
          end_date: addDaysIso(28),
          sort_order: 3,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: cernerProjId,
          name: "Run first cohort (3-day)",
          status: "not_started",
          priority: "high",
          estimated_hours: 72,
          percent_complete: 0,
          start_date: addDaysIso(30),
          end_date: addDaysIso(45),
          sort_order: 4,
        },
        {
          org_id: orgId,
          department_id: deptId,
          project_id: cernerProjId,
          name: "Code response sim build",
          status: "on_hold",
          priority: "medium",
          estimated_hours: 32,
          percent_complete: 10,
          start_date: addDaysIso(0),
          end_date: addDaysIso(35),
          sort_order: 5,
        },
      ])
      .select("id, name, project_id");

    // External dep for Cerner project
    await admin.from("dependencies").insert({
      org_id: orgId,
      department_id: deptId,
      project_id: cernerProjId,
      name: "Epic build environment access for screen captures",
      description: "Need provisioned screens before deck build can finish.",
      status: "in_progress",
      dep_type: "vendor",
      target_resolution_date: addDaysIso(5),
    });

    // Task assignments — give a couple to team members
    if (teamRows && taskRows) {
      const cernerTeam = teamRows.filter((t) => t.project_id === cernerProjId);
      const lead = cernerTeam.find((t) => t.role === "lead");
      const designTask = taskRows.find((t) => t.name.includes("Curriculum design"));
      const inpatTask = taskRows.find((t) => t.name.includes("inpatient bootcamp"));
      const assigns = [
        ...(lead && designTask ? [{ task_id: designTask.id, ptm_id: lead.id, hours: 40 }] : []),
        ...(lead && inpatTask ? [{ task_id: inpatTask.id, ptm_id: lead.id, hours: 30 }] : []),
      ];
      if (assigns.length > 0) {
        await admin.from("task_assignments").insert(
          assigns.map((a) => ({
            org_id: orgId,
            department_id: deptId,
            task_id: a.task_id,
            project_team_member_id: a.ptm_id,
            allocated_hours: a.hours,
          })),
        );
      }
    }

    // ── 14. Implementation (training planner) ────────────────────────────
    const { data: implRows } = await admin
      .from("implementations")
      .insert({
        org_id: orgId,
        department_id: deptId,
        name: "Epic Cutover — Wave 1 (Inpatient Nursing)",
        status: "active",
        description:
          "Wave 1 of three. Inpatient nursing only (~480 staff). 6-week classroom + sim window.",
        window_start_date: addDaysIso(30),
        window_end_date: addDaysIso(72),
        go_live_date: addDaysIso(75),
        current_step: 5,
        linked_tra_id: traByName.get("Cerner-to-Epic Migration Education") ?? null,
        linked_project_id: cernerProjId,
      })
      .select("id, name");
    if (implRows && implRows.length > 0) {
      const implId = implRows[0]!.id;

      // Modules
      const { data: moduleRows } = await admin
        .from("impl_modules")
        .insert([
          {
            org_id: orgId,
            department_id: deptId,
            implementation_id: implId,
            name: "Core Inpatient Workflows",
            sort_order: 0,
          },
          {
            org_id: orgId,
            department_id: deptId,
            implementation_id: implId,
            name: "Med Admin & MAR",
            sort_order: 1,
          },
        ])
        .select("id, name");
      const modByName = new Map((moduleRows ?? []).map((m) => [m.name, m.id]));

      // Classes
      await admin.from("impl_classes").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          module_id: modByName.get("Core Inpatient Workflows") ?? null,
          name: "Inpatient Bootcamp (3-day)",
          expected_learners_per_session: 18,
          hours_per_session: 24,
          total_people_to_train: 480,
          sort_order: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          module_id: modByName.get("Med Admin & MAR") ?? null,
          name: "Med Admin Lab",
          expected_learners_per_session: 12,
          hours_per_session: 4,
          total_people_to_train: 480,
          sort_order: 1,
        },
      ]);

      // Rooms
      await admin.from("impl_rooms").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          name: "Education Center A",
          seat_capacity: 24,
          available_hours_per_day: 8,
          sort_order: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          name: "Education Center B (Sim)",
          seat_capacity: 16,
          available_hours_per_day: 8,
          sort_order: 1,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          name: "Conference Suite 304",
          seat_capacity: 30,
          available_hours_per_day: 6,
          sort_order: 2,
        },
      ]);

      // Trainers (from instructor pool)
      await admin.from("impl_trainers").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          name: "Maya Castellanos",
          instructor_id: instById.get("Maya Castellanos")!.id,
          availability_hours_per_week: 32,
          max_concurrent_sessions: 2,
          sort_order: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          name: "Devon Park",
          instructor_id: instById.get("Devon Park")!.id,
          availability_hours_per_week: 24,
          max_concurrent_sessions: 1,
          sort_order: 1,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implId,
          name: "Aisha Bello",
          instructor_id: instById.get("Aisha Bello")!.id,
          availability_hours_per_week: 24,
          max_concurrent_sessions: 1,
          sort_order: 2,
        },
      ]);
    }

    // Second implementation — CLEAN feasibility (plenty of headroom).
    // BLS Annual Refresh in Q3: 60 staff × one 4-hour class = 5 sessions,
    // 2 rooms × 8h/day for 30 days, 2 trainers with 40 + 24 h/wk. Easy fit.
    const { data: implBlsRows } = await admin
      .from("implementations")
      .insert({
        org_id: orgId,
        department_id: deptId,
        name: "BLS Annual Refresh — Q3 Wave",
        status: "active",
        description:
          "Annual BLS provider re-certification for 60 frontline staff. Two trainers, two rooms — plenty of slack.",
        window_start_date: addDaysIso(45),
        window_end_date: addDaysIso(75),
        go_live_date: addDaysIso(78),
        current_step: 7,
      })
      .select("id, name");
    if (implBlsRows && implBlsRows.length > 0) {
      const implBlsId = implBlsRows[0]!.id;
      const { data: blsModules } = await admin
        .from("impl_modules")
        .insert([
          {
            org_id: orgId,
            department_id: deptId,
            implementation_id: implBlsId,
            name: "BLS Skills Stations",
            sort_order: 0,
          },
        ])
        .select("id, name");
      const blsModByName = new Map((blsModules ?? []).map((m) => [m.name, m.id]));
      await admin.from("impl_classes").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implBlsId,
          module_id: blsModByName.get("BLS Skills Stations") ?? null,
          name: "BLS Skills + Megacode",
          expected_learners_per_session: 12,
          hours_per_session: 4,
          total_people_to_train: 60,
          sort_order: 0,
        },
      ]);
      await admin.from("impl_rooms").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implBlsId,
          name: "Sim Lab North",
          seat_capacity: 12,
          available_hours_per_day: 8,
          sort_order: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implBlsId,
          name: "Sim Lab South",
          seat_capacity: 12,
          available_hours_per_day: 8,
          sort_order: 1,
        },
      ]);
      await admin.from("impl_trainers").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implBlsId,
          name: "Reggie Strand",
          instructor_id: instById.get("Reggie Strand")!.id,
          availability_hours_per_week: 40,
          max_concurrent_sessions: 1,
          sort_order: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implBlsId,
          name: "Aisha Bello",
          instructor_id: instById.get("Aisha Bello")!.id,
          availability_hours_per_week: 24,
          max_concurrent_sessions: 1,
          sort_order: 1,
        },
      ]);
    }

    // Third implementation — BOTTLENECK feasibility. Short window, one
    // small room, one over-allocated trainer. Designed to surface the new
    // room_capacity diagnosis on Calculate — the "don't hire trainers,
    // fix the room" guard shipped today in the scheduler rewrite.
    const { data: implRoboRows } = await admin
      .from("implementations")
      .insert({
        org_id: orgId,
        department_id: deptId,
        name: "Robotics Console Recert — System-wide",
        status: "active",
        description:
          "120 surgeons system-wide due for da Vinci console recertification. Tight 30-day window, one console lab, one qualified trainer.",
        window_start_date: addDaysIso(10),
        window_end_date: addDaysIso(40),
        go_live_date: addDaysIso(45),
        current_step: 3,
      })
      .select("id, name");
    if (implRoboRows && implRoboRows.length > 0) {
      const implRoboId = implRoboRows[0]!.id;
      const { data: roboModules } = await admin
        .from("impl_modules")
        .insert([
          {
            org_id: orgId,
            department_id: deptId,
            implementation_id: implRoboId,
            name: "Console Recert Lab",
            sort_order: 0,
          },
          {
            org_id: orgId,
            department_id: deptId,
            implementation_id: implRoboId,
            name: "Procedural Drills",
            sort_order: 1,
          },
        ])
        .select("id, name");
      const roboModByName = new Map((roboModules ?? []).map((m) => [m.name, m.id]));
      await admin.from("impl_classes").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implRoboId,
          module_id: roboModByName.get("Console Recert Lab") ?? null,
          name: "Console Recert — 1:1",
          expected_learners_per_session: 4,
          hours_per_session: 8,
          total_people_to_train: 80,
          sort_order: 0,
        },
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implRoboId,
          module_id: roboModByName.get("Procedural Drills") ?? null,
          name: "Procedural Drill Block",
          expected_learners_per_session: 4,
          hours_per_session: 8,
          total_people_to_train: 40,
          sort_order: 1,
        },
      ]);
      await admin.from("impl_rooms").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implRoboId,
          name: "Robotics Console Lab",
          seat_capacity: 4,
          available_hours_per_day: 6,
          sort_order: 0,
        },
      ]);
      await admin.from("impl_trainers").insert([
        {
          org_id: orgId,
          department_id: deptId,
          implementation_id: implRoboId,
          name: "Priya Chandrasekaran",
          instructor_id: instById.get("Priya Chandrasekaran")!.id,
          availability_hours_per_week: 16,
          max_concurrent_sessions: 1,
          sort_order: 0,
        },
      ]);
    }

    // ── 15. Education requests + assignments ─────────────────────────────
    // 6 requests spread across the kanban so the Request Queue board has a
    // card in every column. Three of them carry assignments to Maya / Priya /
    // Hannah — those assigned hours feed the utilization-band story (Maya
    // and Priya into over-allocated, Hannah into at-risk).
    const { data: edRequests } = await admin
      .from("education_requests")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          title: "ICU vasopressor titration refresher",
          requested_by_name: "Dr. Anita Shah",
          requested_by_email: "ashah@riverside.example",
          requested_by_department: "ICU",
          business_justification:
            "New norepinephrine protocol rolled out last month. Nurses need a hands-on titration refresher before next month's audits.",
          target_audience: "ICU RNs (~40 staff)",
          urgency: "high",
          target_completion_date: addDaysIso(45),
          status: "new",
          submitted_via: "form",
          bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          title: "New-grad onboarding pathway redesign",
          requested_by_name: "Karen Liu, RN, MSN",
          requested_by_email: "kliu@riverside.example",
          requested_by_department: "Nursing",
          business_justification:
            "Current 12-week onboarding underperforms — turnover at month 4 is 22%. Need a re-skinned pathway with embedded simulation checkpoints.",
          target_audience: "New-grad RNs (~25 hires/yr)",
          urgency: "standard",
          status: "under_review",
          submitted_via: "form",
          bucket_id: bucketByName.get("Course Development")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          title: "Stroke alert team simulation",
          requested_by_name: "Dr. James Park",
          requested_by_email: "jpark@riverside.example",
          requested_by_department: "Neurology",
          business_justification:
            "Door-to-needle metrics slipping. Multidisciplinary sim quarterly to rebuild muscle memory.",
          target_audience: "ED + Neuro + Pharmacy (15 per cohort)",
          urgency: "high",
          target_completion_date: addDaysIso(60),
          status: "approved",
          submitted_via: "app",
          bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          title: "Epic downtime procedure training",
          requested_by_name: "IT Operations",
          requested_by_email: "itops@riverside.example",
          requested_by_department: "IT",
          business_justification:
            "Quarterly downtime drills now mandatory per Joint Commission finding. Every unit needs an annual refresh.",
          target_audience: "All clinical staff (~1,600)",
          urgency: "urgent",
          target_completion_date: addDaysIso(28),
          status: "assigned",
          submitted_via: "app",
          bucket_id: bucketByName.get("Direct Training")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          title: "OR fire safety annual refresher",
          requested_by_name: "OR Safety Committee",
          requested_by_email: "or-safety@riverside.example",
          requested_by_department: "Surgery",
          business_justification:
            "Annual regulatory requirement. Last cycle's completion rate was 87% — need a tighter rollout.",
          target_audience: "OR staff (~120)",
          urgency: "standard",
          target_completion_date: addDaysIso(90),
          status: "in_progress",
          submitted_via: "app",
          bucket_id: bucketByName.get("Compliance & Audits")!,
        },
        {
          org_id: orgId,
          department_id: deptId,
          title: "Bedside ultrasound credentialing series",
          requested_by_name: "Dr. Maria Gonzalez",
          requested_by_email: "mgonzalez@riverside.example",
          requested_by_department: "Emergency",
          business_justification:
            "POCUS volume up 40%. Need a 4-session credentialing track aligned with ACEP guidelines.",
          target_audience: "EM attendings + senior residents",
          urgency: "standard",
          status: "completed",
          submitted_via: "form",
          bucket_id: bucketByName.get("Course Development")!,
        },
      ])
      .select("id, title, status");

    if (edRequests) {
      const edByTitle = new Map(edRequests.map((r) => [r.title, r.id]));
      const epicDowntimeId = edByTitle.get("Epic downtime procedure training");
      const orFireSafetyId = edByTitle.get("OR fire safety annual refresher");
      const ultrasoundId = edByTitle.get("Bedside ultrasound credentialing series");
      const nowIso = new Date().toISOString();
      const erAssignments: Array<{
        request_id: string;
        instructor_name: string;
        estimated_hours: number;
        actual_hours?: number;
        started_at?: string;
        completed_at?: string;
      }> = [];
      if (epicDowntimeId) {
        erAssignments.push({
          request_id: epicDowntimeId,
          instructor_name: "Maya Castellanos",
          estimated_hours: 40,
        });
      }
      if (orFireSafetyId) {
        erAssignments.push({
          request_id: orFireSafetyId,
          instructor_name: "Priya Chandrasekaran",
          estimated_hours: 20,
          started_at: addDaysIso(-7) + "T14:00:00Z",
        });
      }
      if (ultrasoundId) {
        erAssignments.push({
          request_id: ultrasoundId,
          instructor_name: "Hannah O'Connor",
          estimated_hours: 40,
          actual_hours: 38,
          started_at: addDaysIso(-45) + "T09:00:00Z",
          completed_at: addDaysIso(-3) + "T16:00:00Z",
        });
      }
      if (erAssignments.length > 0) {
        await admin.from("education_request_assignments").insert(
          erAssignments.map((a) => ({
            org_id: orgId,
            department_id: deptId,
            request_id: a.request_id,
            instructor_id: instById.get(a.instructor_name)!.id,
            estimated_hours: a.estimated_hours,
            ...(a.actual_hours !== undefined ? { actual_hours: a.actual_hours } : {}),
            ...(a.started_at ? { started_at: a.started_at } : {}),
            ...(a.completed_at ? { completed_at: a.completed_at } : {}),
          })),
        );
      }
      void nowIso;
    }

    // ── 16. One-on-ones + action items + workload changes ────────────────
    // Three records: Maya (completed 2wk ago, over-allocation flagged),
    // Hannah (completed 1wk ago, at-risk), Priya (upcoming, +3d).
    const { data: oneOnOnes } = await admin
      .from("one_on_ones")
      .insert([
        {
          org_id: orgId,
          department_id: deptId,
          instructor_id: instById.get("Maya Castellanos")!.id,
          manager_id: user.id,
          scheduled_for: addDaysIso(-14) + "T15:00:00Z",
          completed_at: addDaysIso(-14) + "T15:38:00Z",
          sentiment: "stretched",
          topics: ["Cerner-to-Epic deck status", "PTO planning", "Backup primary for Bootcamp"],
          concerns: ["over-allocation"],
          snapshot_total_hours: 2280,
          snapshot_utilization_pct: 109.6,
          snapshot_at: addDaysIso(-14) + "T15:00:00Z",
        },
        {
          org_id: orgId,
          department_id: deptId,
          instructor_id: instById.get("Hannah O'Connor")!.id,
          manager_id: user.id,
          scheduled_for: addDaysIso(-7) + "T13:00:00Z",
          completed_at: addDaysIso(-7) + "T13:28:00Z",
          sentiment: "engaged",
          topics: ["Trauma sim curriculum updates", "ACLS cert renewal"],
          concerns: [],
          snapshot_total_hours: 1830,
          snapshot_utilization_pct: 88.0,
          snapshot_at: addDaysIso(-7) + "T13:00:00Z",
        },
        {
          org_id: orgId,
          department_id: deptId,
          instructor_id: instById.get("Priya Chandrasekaran")!.id,
          manager_id: user.id,
          scheduled_for: addDaysIso(3) + "T16:00:00Z",
          sentiment: null,
          topics: [],
          concerns: [],
        },
      ])
      .select("id, instructor_id");

    if (oneOnOnes && oneOnOnes.length >= 2) {
      // Find the rows by their instructor for clarity.
      const mayaInstId = instById.get("Maya Castellanos")!.id;
      const hannahInstId = instById.get("Hannah O'Connor")!.id;
      const mayaOOO = oneOnOnes.find((o) => o.instructor_id === mayaInstId);
      const hannahOOO = oneOnOnes.find((o) => o.instructor_id === hannahInstId);

      const actionRows: Array<{
        one_on_one_id: string;
        description: string;
        category: string;
        owner: string;
        status: string;
        due_by?: string;
        resolved_at?: string;
      }> = [];

      if (mayaOOO) {
        actionRows.push(
          {
            one_on_one_id: mayaOOO.id,
            description: "Reduce Epic Bootcamp from 18 → 12 offerings this cycle",
            category: "load_reduction",
            owner: "manager",
            status: "done",
            resolved_at: addDaysIso(-10) + "T11:00:00Z",
          },
          {
            one_on_one_id: mayaOOO.id,
            description: "Identify backup primary for Inpatient Bootcamp",
            category: "backup",
            owner: "manager",
            status: "open",
            due_by: addDaysIso(14),
          },
          {
            one_on_one_id: mayaOOO.id,
            description: "Schedule PTO — week of June 23",
            category: "wellbeing",
            owner: "instructor",
            status: "done",
            resolved_at: addDaysIso(-12) + "T09:00:00Z",
          },
          {
            one_on_one_id: mayaOOO.id,
            description: "Submit travel for Epic UGM",
            category: "development",
            owner: "instructor",
            status: "open",
            due_by: addDaysIso(30),
          },
        );
      }
      if (hannahOOO) {
        actionRows.push(
          {
            one_on_one_id: hannahOOO.id,
            description: "Renew Adult ACLS cert (expires in 15d)",
            category: "certification",
            owner: "instructor",
            status: "open",
            due_by: addDaysIso(14),
          },
          {
            one_on_one_id: hannahOOO.id,
            description: "Refresh stroke-alert sim deck",
            category: "course_development",
            owner: "instructor",
            status: "done",
            resolved_at: addDaysIso(-2) + "T17:00:00Z",
          },
          {
            one_on_one_id: hannahOOO.id,
            description: "Confirm Reggie as backup primary for Trauma sim",
            category: "backup",
            owner: "manager",
            status: "done",
            resolved_at: addDaysIso(-5) + "T10:00:00Z",
          },
        );
      }

      if (actionRows.length > 0) {
        await admin.from("one_on_one_action_items").insert(
          actionRows.map((a) => ({
            org_id: orgId,
            department_id: deptId,
            one_on_one_id: a.one_on_one_id,
            description: a.description,
            category: a.category,
            owner: a.owner,
            status: a.status,
            ...(a.due_by ? { due_by: a.due_by } : {}),
            ...(a.resolved_at ? { resolved_at: a.resolved_at } : {}),
          })),
        );
      }

      // Workload changes audit trail for Maya's over-allocation 1:1.
      if (mayaOOO) {
        await admin.from("one_on_one_workload_changes").insert([
          {
            org_id: orgId,
            department_id: deptId,
            one_on_one_id: mayaOOO.id,
            source_kind: "class_assignment",
            source_id: classByName.get("Epic EHR — Inpatient Nursing Bootcamp")!,
            change_kind: "modified",
            before_value: { assigned_offerings: 18 },
            after_value: { assigned_offerings: 12 },
            rationale_category: "over_allocation",
            actor_id: user.id,
          },
          {
            org_id: orgId,
            department_id: deptId,
            one_on_one_id: mayaOOO.id,
            source_kind: "ad_hoc_task",
            source_id: mayaOOO.id, // synthetic — pre-merge migration leaves source_id required
            change_kind: "removed",
            before_value: { hours: 6, name: "Update sepsis bundle order set training" },
            after_value: null,
            rationale_category: "over_allocation",
            actor_id: user.id,
          },
        ]);
      }
    }

    // ── 17. Saved reports — pre-staged templates ─────────────────────────
    await admin.from("saved_reports").insert([
      {
        org_id: orgId,
        department_id: deptId,
        slug: "workload",
        name: "At-risk instructors (weekly)",
        description: "Anyone above 80% utilization. Run weekly for the staff meeting.",
        filters: { utilization_band: "at_risk" },
        org_visibility: true,
        last_run_at: addDaysIso(-3) + "T08:00:00Z",
        created_by: user.id,
      },
      {
        org_id: orgId,
        department_id: deptId,
        slug: "skill-gap",
        name: "Cert expirations — 60-day lookahead",
        description: "Catch ACLS / BLS renewals before they lapse.",
        filters: { expiry_window_days: 60 },
        org_visibility: true,
        last_run_at: addDaysIso(-1) + "T08:00:00Z",
        created_by: user.id,
      },
      {
        org_id: orgId,
        department_id: deptId,
        slug: "allocation",
        name: "Q3 allocation summary",
        description: "Bucket-level target vs actual across the whole team.",
        filters: { bucket_ids: [] },
        org_visibility: false,
        created_by: user.id,
      },
    ]);

    // ── 18. Sketchpad — Epic Cutover Week 1 mockup ───────────────────────
    const { data: sketchSchedule } = await admin
      .from("sketchpad_schedules")
      .insert({
        org_id: orgId,
        department_id: deptId,
        name: "Epic Cutover — Week 1 mockup",
        notes: "Draft layout for review with the unit managers next Tuesday.",
        start_date: addDaysIso(30),
        day_count: 5,
        hours_start: 8,
        hours_end: 17,
        slot_minutes: 30,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (sketchSchedule) {
      const scheduleId = sketchSchedule.id;
      const { data: skRooms } = await admin
        .from("sketchpad_rooms")
        .insert([
          {
            org_id: orgId,
            schedule_id: scheduleId,
            name: "Education Center A",
            capacity: 24,
            position: 0,
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            name: "Education Center B",
            capacity: 16,
            position: 1,
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            name: "Conference Suite 304",
            capacity: 30,
            position: 2,
          },
        ])
        .select("id, name");

      if (skRooms) {
        const roomByName = new Map(skRooms.map((r) => [r.name, r.id]));
        const start = addDaysIso(30);
        const bootcampGroupId = crypto.randomUUID();
        const sessionStart = (dayOffset: number, hourLocal: number): string => {
          const d = new Date(start + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + dayOffset);
          d.setUTCHours(hourLocal + 5, 0, 0, 0); // ~ET morning in UTC
          return d.toISOString();
        };
        await admin.from("sketchpad_sessions").insert([
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Education Center A")!,
            trainer_name: "Maya Castellanos",
            class_name: "Inpatient Bootcamp — Day 1",
            starts_at: sessionStart(0, 8),
            ends_at: sessionStart(0, 17),
            learner_count: 18,
            color: "#1F4D3A",
            group_id: bootcampGroupId,
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Education Center A")!,
            trainer_name: "Maya Castellanos",
            class_name: "Inpatient Bootcamp — Day 2",
            starts_at: sessionStart(1, 8),
            ends_at: sessionStart(1, 17),
            learner_count: 18,
            color: "#1F4D3A",
            group_id: bootcampGroupId,
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Education Center A")!,
            trainer_name: "Maya Castellanos",
            class_name: "Inpatient Bootcamp — Day 3",
            starts_at: sessionStart(2, 8),
            ends_at: sessionStart(2, 17),
            learner_count: 18,
            color: "#1F4D3A",
            group_id: bootcampGroupId,
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Education Center B")!,
            trainer_name: "Devon Park",
            class_name: "Med Admin Lab",
            starts_at: sessionStart(0, 13),
            ends_at: sessionStart(0, 17),
            learner_count: 12,
            color: "#8FA68E",
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Education Center B")!,
            trainer_name: "Devon Park",
            class_name: "Med Admin Lab",
            starts_at: sessionStart(1, 13),
            ends_at: sessionStart(1, 17),
            learner_count: 12,
            color: "#8FA68E",
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Education Center B")!,
            trainer_name: "Aisha Bello",
            class_name: "Med Admin Lab",
            starts_at: sessionStart(2, 13),
            ends_at: sessionStart(2, 17),
            learner_count: 12,
            color: "#8FA68E",
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Conference Suite 304")!,
            trainer_name: "Aisha Bello",
            class_name: "Downtime Procedures Briefing",
            starts_at: sessionStart(3, 9),
            ends_at: sessionStart(3, 12),
            learner_count: 30,
            color: "#D4A574",
          },
          {
            org_id: orgId,
            schedule_id: scheduleId,
            room_id: roomByName.get("Conference Suite 304")!,
            trainer_name: "Maya Castellanos",
            class_name: "Super-user Briefing",
            starts_at: sessionStart(4, 14),
            ends_at: sessionStart(4, 17),
            learner_count: 25,
            color: "#1F4D3A",
          },
        ]);
      }
    }

    // ── 19. Support tickets (sample) — org-scoped (no department_id) ─────
    await admin.from("support_tickets").insert([
      {
        org_id: orgId,
        user_id: user.id,
        subject: "Roster export for Wave 1 cohorts",
        description: "Need a one-click roster export with name, role, unit, and class assignment.",
        status: "open",
        priority: "medium",
        category: "feature_request",
      },
      {
        org_id: orgId,
        user_id: user.id,
        subject: "Allocation slider not snapping to 100%",
        description:
          "When I set Direct Training to 50% and Course Dev to 49%, the residual rounds incorrectly.",
        status: "pending",
        priority: "low",
        category: "bug",
      },
    ]);

    revalidatePath("/admin");
    revalidatePath("/");

    return {
      ok: true,
      orgId,
      counts: {
        instructors: instructorSeeds.length,
        skills: skillSeeds.length,
        classes: classes.length,
        buckets: bucketSeeds.length,
        tras: tras?.length ?? 0,
        projects: projects.length,
        implementations:
          (implRows?.length ?? 0) + (implBlsRows?.length ?? 0) + (implRoboRows?.length ?? 0),
        education_requests: edRequests?.length ?? 0,
        one_on_ones: oneOnOnes?.length ?? 0,
        saved_reports: 3,
        sketchpad_schedules: sketchSchedule ? 1 : 0,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
