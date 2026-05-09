-- TRA enhancement: full intake form rework.
--
-- Drops description / target_audience / urgency / stakeholder_name /
-- stakeholder_email (single-stakeholder duo). Renames business_justification
-- → business_problem. Adds ~30 new columns covering Sections 1-7 of the
-- target schema. Creates 8 new child tables for repeatable rows
-- (stakeholders, audience roles, KPIs, success criteria, objectives, SMEs,
-- evaluation plan, approvals).
--
-- Required-at-submit (priority, business_problem, cost_of_inaction,
-- root_cause_answer) is enforced in the application layer at status flip
-- to 'submitted', not via NOT NULL — keeps draft TRAs flexible.

begin;

-- ── tras column changes ────────────────────────────────────────────────────

alter table public.tras drop column if exists description;
alter table public.tras drop column if exists target_audience;
alter table public.tras drop column if exists urgency;
alter table public.tras drop column if exists stakeholder_name;
alter table public.tras drop column if exists stakeholder_email;

alter table public.tras rename column business_justification to business_problem;

-- Section 1: Request basics
alter table public.tras add column requestor_name        text;
alter table public.tras add column requestor_role        text;
alter table public.tras add column requestor_department  text;
alter table public.tras add column submitted_at          timestamptz;
alter table public.tras add column executive_sponsor     text;
alter table public.tras add column needed_by_date        date;
alter table public.tras add column needed_by_driver      text
  check (needed_by_driver in ('launch','audit','fiscal','regulatory','other'));

-- Section 2: The need
alter table public.tras add column current_behavior        text;
alter table public.tras add column desired_behavior        text;
alter table public.tras add column root_cause_answer       text
  check (root_cause_answer in ('yes','maybe','no'));
alter table public.tras add column root_cause_justification text;
alter table public.tras add column prior_attempts          text;
alter table public.tras add column cost_of_inaction        text;

-- Section 3: Audience
alter table public.tras add column audience_locations    text[] not null default '{}';
alter table public.tras add column audience_languages    text[] not null default '{}';
alter table public.tras add column prerequisite_knowledge text;
alter table public.tras add column tech_access            text;
alter table public.tras add column accessibility_needs    text;

-- Section 4: Business case
alter table public.tras add column priority         text
  check (priority in ('nice_to_have','important','regulatory'));
alter table public.tras add column budget_range     text;
alter table public.tras add column funding_source   text;

-- Section 5: Learning design (TRA-level — deliverables stay in tra_deliverables)
alter table public.tras add column existing_content          text;
alter table public.tras add column recommended_modalities    text[] not null default '{}';
-- Allowed values for recommended_modalities (array contents check):
alter table public.tras add constraint tras_recommended_modalities_check
  check (recommended_modalities <@ array['ilt','vilt','elearning','blended','microlearning','job_aid','coaching']::text[]);
alter table public.tras add column estimated_seat_time_hours numeric(9,2);
alter table public.tras add column delivery_cadence          text
  check (delivery_cadence in ('one_time','cohort','always_on','recurring'));
alter table public.tras add column assessment_approaches     text[] not null default '{}';

-- Section 6: Logistics
alter table public.tras add column technology_requirements text;
alter table public.tras add column wcag_target             text
  check (wcag_target in ('a','aa','aaa','section_508','none'));
alter table public.tras add column localization_needs      text;
alter table public.tras add column constraints_notes       text;
alter table public.tras add column pilot_group             text;
alter table public.tras add column feedback_mechanism      text;

-- Section 7: Sustainment
alter table public.tras add column content_owner       text;
alter table public.tras add column reinforcement_plan  text;
alter table public.tras add column review_cadence      text;

-- ── Child tables ───────────────────────────────────────────────────────────
-- All scoped to org+department like the existing TRA-related tables.
-- RLS mirrors the tra_deliverables pattern: org members read, dept members
-- write, org admins write across departments.

-- 1. tra_stakeholders (Section 1)
create table public.tra_stakeholders (
  id              uuid not null default gen_random_uuid() primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  department_id   uuid not null references public.departments(id) on delete cascade,
  tra_id          uuid not null references public.tras(id) on delete cascade,
  position        integer not null default 0,
  name            text,
  role            text,
  decision_rights text,
  email           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.tra_stakeholders (tra_id);
create index on public.tra_stakeholders (org_id);
alter table public.tra_stakeholders enable row level security;

-- 2. tra_audience_roles (Section 3)
create table public.tra_audience_roles (
  id            uuid not null default gen_random_uuid() primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  tra_id        uuid not null references public.tras(id) on delete cascade,
  position      integer not null default 0,
  role          text,
  headcount     integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.tra_audience_roles (tra_id);
create index on public.tra_audience_roles (org_id);
alter table public.tra_audience_roles enable row level security;

-- 3. tra_kpis (Section 4)
create table public.tra_kpis (
  id            uuid not null default gen_random_uuid() primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  tra_id        uuid not null references public.tras(id) on delete cascade,
  position      integer not null default 0,
  metric        text,
  baseline      text,
  target        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.tra_kpis (tra_id);
create index on public.tra_kpis (org_id);
alter table public.tra_kpis enable row level security;

-- 4. tra_success_criteria (Section 4) — checkpoint enum 30/90/180
create table public.tra_success_criteria (
  id                 uuid not null default gen_random_uuid() primary key,
  org_id             uuid not null references public.organizations(id) on delete cascade,
  department_id      uuid not null references public.departments(id) on delete cascade,
  tra_id             uuid not null references public.tras(id) on delete cascade,
  checkpoint         text not null check (checkpoint in ('30','90','180')),
  criteria           text,
  measurement_owner  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tra_id, checkpoint)
);
create index on public.tra_success_criteria (tra_id);
create index on public.tra_success_criteria (org_id);
alter table public.tra_success_criteria enable row level security;

-- 5. tra_objectives (Section 5)
create table public.tra_objectives (
  id            uuid not null default gen_random_uuid() primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  tra_id        uuid not null references public.tras(id) on delete cascade,
  position      integer not null default 0,
  text          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.tra_objectives (tra_id);
create index on public.tra_objectives (org_id);
alter table public.tra_objectives enable row level security;

-- 6. tra_smes (Section 5)
create table public.tra_smes (
  id                  uuid not null default gen_random_uuid() primary key,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  department_id       uuid not null references public.departments(id) on delete cascade,
  tra_id              uuid not null references public.tras(id) on delete cascade,
  position            integer not null default 0,
  name                text,
  email               text,
  availability_hours  numeric(7,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.tra_smes (tra_id);
create index on public.tra_smes (org_id);
alter table public.tra_smes enable row level security;

-- 7. tra_evaluation_plan (Section 5) — Kirkpatrick levels 1-4, one row per level
create table public.tra_evaluation_plan (
  id                  uuid not null default gen_random_uuid() primary key,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  department_id       uuid not null references public.departments(id) on delete cascade,
  tra_id              uuid not null references public.tras(id) on delete cascade,
  kirkpatrick_level   smallint not null check (kirkpatrick_level between 1 and 4),
  measurement_method  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tra_id, kirkpatrick_level)
);
create index on public.tra_evaluation_plan (tra_id);
create index on public.tra_evaluation_plan (org_id);
alter table public.tra_evaluation_plan enable row level security;

-- 8. tra_approvals (Section 8) — sponsor / budget / id_lead / scope_change
create table public.tra_approvals (
  id            uuid not null default gen_random_uuid() primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  tra_id        uuid not null references public.tras(id) on delete cascade,
  approval_type text not null
    check (approval_type in ('sponsor','budget','id_lead','scope_change')),
  name          text,
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tra_id, approval_type)
);
create index on public.tra_approvals (tra_id);
create index on public.tra_approvals (org_id);
alter table public.tra_approvals enable row level security;

-- ── RLS for new child tables ───────────────────────────────────────────────
-- Members of the org can SELECT; members of the department (or org admins)
-- can INSERT / UPDATE / DELETE. Mirrors tra_deliverables.

do $$
declare
  t text;
  child_tables text[] := array[
    'tra_stakeholders',
    'tra_audience_roles',
    'tra_kpis',
    'tra_success_criteria',
    'tra_objectives',
    'tra_smes',
    'tra_evaluation_plan',
    'tra_approvals'
  ];
begin
  foreach t in array child_tables loop
    execute format($f$
      create policy %I on public.%I
        for select using (org_id in (select public.user_org_ids()));
    $f$, t || '_select', t);

    execute format($f$
      create policy %I on public.%I
        for all using (
          org_id in (select public.user_org_ids())
          and (
            department_id in (select public.user_department_ids())
            or public.is_org_admin(org_id)
          )
        )
        with check (
          org_id in (select public.user_org_ids())
          and (
            department_id in (select public.user_department_ids())
            or public.is_org_admin(org_id)
          )
        );
    $f$, t || '_modify', t);
  end loop;
end $$;

-- ── updated_at triggers ────────────────────────────────────────────────────
-- The set_updated_at function exists from earlier migrations.

do $$
declare
  t text;
  child_tables text[] := array[
    'tra_stakeholders',
    'tra_audience_roles',
    'tra_kpis',
    'tra_success_criteria',
    'tra_objectives',
    'tra_smes',
    'tra_evaluation_plan',
    'tra_approvals'
  ];
begin
  foreach t in array child_tables loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at();',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

commit;
