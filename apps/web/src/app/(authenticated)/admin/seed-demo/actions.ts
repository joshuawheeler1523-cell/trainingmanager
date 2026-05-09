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
  // Caller must be authed — they'll be granted org_admin on the new org.
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
      role: "org_admin",
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
    // Capacity narrative for the demo: a few part-time educators dedicated to
    // a specific program land in the over-allocated / at-risk bands so the
    // dashboard shows realistic variety; the rest are full-time but
    // under-loaded (typical for an internal ed team that has slack).
    const instructorSeeds: { full_name: string; department: string; annual_hours: number }[] = [
      { full_name: "Maya Castellanos", department: "Nursing Education", annual_hours: 600 },
      { full_name: "Devon Park", department: "Nursing Education", annual_hours: 58 },
      { full_name: "Aisha Bello", department: "Nursing Education", annual_hours: 500 },
      { full_name: "Tomás Rivera", department: "Clinical Informatics", annual_hours: 2080 },
      { full_name: "Sasha Petrov", department: "Clinical Informatics", annual_hours: 2080 },
      { full_name: "Priya Chandrasekaran", department: "Surgery", annual_hours: 150 },
      { full_name: "Marcus Webb", department: "Surgery", annual_hours: 1664 },
      { full_name: "Hannah O'Connor", department: "Emergency", annual_hours: 200 },
      { full_name: "Reggie Strand", department: "Emergency", annual_hours: 280 },
      { full_name: "Nadia Haddad", department: "Pediatrics", annual_hours: 2080 },
      { full_name: "Quentin Reyes", department: "Compliance & Quality", annual_hours: 2080 },
      { full_name: "Linnea Forsberg", department: "Compliance & Quality", annual_hours: 1872 },
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
    type Prof = "beginner" | "intermediate" | "advanced" | "expert";
    const skillAssignments: Array<[string, string, Prof]> = [
      ["Maya Castellanos", "Epic EHR", "expert"],
      ["Maya Castellanos", "Adult Learning Theory", "advanced"],
      ["Maya Castellanos", "BLS / CPR", "expert"],
      ["Devon Park", "Cerner Millennium", "advanced"],
      ["Devon Park", "Adult Learning Theory", "intermediate"],
      ["Aisha Bello", "Epic EHR", "advanced"],
      ["Aisha Bello", "BLS / CPR", "advanced"],
      ["Tomás Rivera", "Epic EHR", "expert"],
      ["Tomás Rivera", "Cerner Millennium", "expert"],
      ["Sasha Petrov", "Epic EHR", "intermediate"],
      ["Sasha Petrov", "Adult Learning Theory", "advanced"],
      ["Priya Chandrasekaran", "Surgical Robotics (da Vinci)", "expert"],
      ["Priya Chandrasekaran", "Adult ACLS", "expert"],
      ["Marcus Webb", "Surgical Robotics (da Vinci)", "advanced"],
      ["Hannah O'Connor", "Trauma & Code Response", "expert"],
      ["Hannah O'Connor", "Adult ACLS", "expert"],
      ["Reggie Strand", "Trauma & Code Response", "advanced"],
      ["Reggie Strand", "BLS / CPR", "expert"],
      ["Nadia Haddad", "Pediatric Critical Care", "expert"],
      ["Nadia Haddad", "BLS / CPR", "advanced"],
      ["Quentin Reyes", "Adult Learning Theory", "intermediate"],
      ["Linnea Forsberg", "Adult Learning Theory", "advanced"],
    ];
    const isRows = skillAssignments
      .map(([name, skillName, prof]) => {
        const inst = instById.get(name);
        const skillId = skillByName.get(skillName);
        if (!inst || !skillId) return null;
        return {
          org_id: orgId,
          department_id: deptId,
          instructor_id: inst.id,
          skill_id: skillId,
          proficiency: prof,
        };
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

    // ── 15. Support tickets (sample) — org-scoped (no department_id) ─────
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
        implementations: implRows?.length ?? 0,
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
