-- Manual verification scenarios for the Skills module (Prompt 1.3).
--
-- Run with:
--   supabase db execute --file packages/db/supabase/tests/skills_scenarios.sql
--
-- Each scenario is a self-contained do-block that creates fixtures, asserts
-- expected behavior, and cleans up. Raises an exception on failure.

-- ── Scenario 1 ────────────────────────────────────────────────────────────────
-- A class requiring Skill A at 'advanced' AND Skill B at 'intermediate' should
-- only return instructors who meet BOTH thresholds.

do $$
declare
  v_org uuid;
  v_class uuid;
  v_skill_a uuid;
  v_skill_b uuid;
  v_qualified uuid[];
  v_inst_a_only uuid;
  v_inst_b_only uuid;
  v_inst_low_a  uuid;
  v_inst_perfect uuid;
begin
  select id into v_org from public.organizations limit 1;

  insert into public.skills (org_id, name)
    values (v_org, 'Test Skill A '||gen_random_uuid()) returning id into v_skill_a;
  insert into public.skills (org_id, name)
    values (v_org, 'Test Skill B '||gen_random_uuid()) returning id into v_skill_b;

  insert into public.classes (org_id, name)
    values (v_org, 'Test Class '||gen_random_uuid()) returning id into v_class;

  insert into public.class_skill_requirements (org_id, class_id, skill_id, min_proficiency, requirement)
    values (v_org, v_class, v_skill_a, 'advanced',     'required'),
           (v_org, v_class, v_skill_b, 'intermediate', 'required');

  insert into public.instructors (org_id, full_name) values (v_org, 'Test A-only')
    returning id into v_inst_a_only;
  insert into public.instructor_skills (org_id, instructor_id, skill_id, proficiency)
    values (v_org, v_inst_a_only, v_skill_a, 'advanced');

  insert into public.instructors (org_id, full_name) values (v_org, 'Test B-only')
    returning id into v_inst_b_only;
  insert into public.instructor_skills (org_id, instructor_id, skill_id, proficiency)
    values (v_org, v_inst_b_only, v_skill_b, 'intermediate');

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Low-A')
    returning id into v_inst_low_a;
  insert into public.instructor_skills (org_id, instructor_id, skill_id, proficiency)
    values (v_org, v_inst_low_a, v_skill_a, 'intermediate'),
           (v_org, v_inst_low_a, v_skill_b, 'advanced');

  insert into public.instructors (org_id, full_name) values (v_org, 'Test Perfect')
    returning id into v_inst_perfect;
  insert into public.instructor_skills (org_id, instructor_id, skill_id, proficiency)
    values (v_org, v_inst_perfect, v_skill_a, 'advanced'),
           (v_org, v_inst_perfect, v_skill_b, 'intermediate');

  select array_agg(instructor_id order by instructor_id) into v_qualified
  from public.qualified_instructors_for_class(v_class);

  if v_qualified is null or array_length(v_qualified, 1) <> 1 then
    raise exception 'Scenario 1 FAIL: expected exactly 1 qualified instructor, got %', v_qualified;
  end if;
  if v_qualified[1] <> v_inst_perfect then
    raise exception 'Scenario 1 FAIL: expected % to qualify, got %', v_inst_perfect, v_qualified[1];
  end if;
  raise notice 'Scenario 1 PASS: only the instructor meeting both requirements qualified';

  -- Cleanup
  delete from public.classes where id = v_class;
  delete from public.skills where id in (v_skill_a, v_skill_b);
  delete from public.instructors where id in (v_inst_a_only, v_inst_b_only, v_inst_low_a, v_inst_perfect);
end $$;

-- ── Scenario 2 ────────────────────────────────────────────────────────────────
-- An instructor_skill cert with expires_at in 25 days should produce a
-- 'cert_expiring' notification when notify_expiring_certifications() runs.
-- The instructor must have a linked auth.users.user_id for the recipient.

do $$
declare
  v_org uuid;
  v_user uuid;
  v_skill uuid;
  v_inst uuid;
  v_isk uuid;
  v_notif_count int;
begin
  select id into v_org from public.organizations limit 1;

  -- Use any existing auth user as recipient (memberships are seeded for the dev account)
  select user_id into v_user from public.org_memberships
    where org_id = v_org and accepted_at is not null limit 1;

  if v_user is null then
    raise exception 'Scenario 2 SETUP: no accepted org member found in org %', v_org;
  end if;

  insert into public.skills (org_id, name, is_certification)
    values (v_org, 'Test Cert '||gen_random_uuid(), true)
    returning id into v_skill;

  insert into public.instructors (org_id, full_name, user_id)
    values (v_org, 'Test Expiring Holder', v_user)
    returning id into v_inst;

  insert into public.instructor_skills (
    org_id, instructor_id, skill_id, proficiency,
    is_certified, certified_at, expires_at
  ) values (
    v_org, v_inst, v_skill, 'advanced',
    true, current_date - interval '300 days', current_date + interval '25 days'
  ) returning id into v_isk;

  -- Run the cron function
  perform public.notify_expiring_certifications();

  select count(*) into v_notif_count from public.notifications
    where recipient_id = v_user
      and kind = 'cert_expiring'
      and link = format('/instructors/%s', v_inst)
      and created_at >= current_date;

  if v_notif_count = 0 then
    raise exception 'Scenario 2 FAIL: expected a cert_expiring notification, got none';
  end if;
  raise notice 'Scenario 2 PASS: % cert_expiring notification(s) created for the 25-day cert', v_notif_count;

  -- Cleanup
  delete from public.notifications
    where recipient_id = v_user
      and kind = 'cert_expiring'
      and link = format('/instructors/%s', v_inst);
  delete from public.instructor_skills where id = v_isk;
  delete from public.instructors where id = v_inst;
  delete from public.skills where id = v_skill;
end $$;
