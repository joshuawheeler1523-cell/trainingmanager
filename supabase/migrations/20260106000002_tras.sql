-- ── deliverable_types ────────────────────────────────────────────────────────
-- Catalog of deliverable categories. Built-in entries have org_id = null and
-- is_built_in = true; orgs can also create their own custom types.
--
-- The unique constraint coalesces null org_id to a sentinel uuid so built-ins
-- don't collide with org-specific types of the same name.

create table public.deliverable_types (
  id                uuid          not null default gen_random_uuid() primary key,
  org_id            uuid          references public.organizations(id) on delete cascade,
  name              text          not null,
  dev_to_seat_ratio numeric(6,2)  not null check (dev_to_seat_ratio >= 0),
  description       text,
  is_built_in       boolean       not null default false,
  is_archived       boolean       not null default false,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  created_by        uuid          references auth.users(id) on delete set null,
  updated_by        uuid          references auth.users(id) on delete set null
);

create unique index deliverable_types_unique_name
  on public.deliverable_types ((coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid)), name);

create index on public.deliverable_types (org_id);
create index on public.deliverable_types (is_archived);

alter table public.deliverable_types enable row level security;

-- Built-ins (org_id is null) are readable by everyone; org-specific entries
-- follow the standard tenant policy.
create policy "deliverable_types_select" on public.deliverable_types
  for select using (
    org_id is null
    or org_id in (select public.user_org_ids())
  );

create policy "deliverable_types_modify" on public.deliverable_types
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('deliverable_types');

create trigger set_actor_audit_fields
  before insert or update on public.deliverable_types
  for each row execute function public.set_actor_audit_fields();

-- Seed: built-in catalog with industry-standard ATD ratios (per data_model §8.6)
insert into public.deliverable_types (org_id, name, dev_to_seat_ratio, is_built_in) values
  (null, 'Instructor-Led Training',         43,  true),
  (null, 'Self-Paced eLearning (Level 2)',  184, true),
  (null, 'Self-Paced eLearning (Level 3)',  490, true),
  (null, 'Microlearning',                   35,  true),
  (null, 'Job Aid',                         12,  true),
  (null, 'Video (produced)',                80,  true),
  (null, 'Webinar',                         25,  true);

-- ── tras ─────────────────────────────────────────────────────────────────────

create table public.tras (
  id                       uuid        not null default gen_random_uuid() primary key,
  org_id                   uuid        not null references public.organizations(id) on delete cascade,
  project_name             text        not null,
  description              text,
  requesting_department    text,
  stakeholder_name         text,
  stakeholder_email        citext,
  business_justification   text,
  target_audience          text,
  urgency                  text        not null default 'standard'
                             check (urgency in ('low','standard','high','urgent')),
  status                   text        not null default 'draft'
                             check (status in ('draft','submitted','approved','converted','rejected')),
  total_estimated_hours    numeric(9,2) not null default 0,
  converted_to_project_id  uuid,         -- FK added in 20260107000001 once projects exists
  ai_assistant_used        boolean     not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid        references auth.users(id) on delete set null,
  updated_by               uuid        references auth.users(id) on delete set null
);

create index on public.tras (org_id, status);
create index on public.tras (org_id, created_at desc);

alter table public.tras enable row level security;

create policy "tras_select" on public.tras
  for select using (org_id in (select public.user_org_ids()));

create policy "tras_modify" on public.tras
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('tras');

create trigger set_actor_audit_fields
  before insert or update on public.tras
  for each row execute function public.set_actor_audit_fields();

-- ── tra_deliverables ─────────────────────────────────────────────────────────

create table public.tra_deliverables (
  id                    uuid          not null default gen_random_uuid() primary key,
  org_id                uuid          not null references public.organizations(id) on delete cascade,
  tra_id                uuid          not null references public.tras(id) on delete cascade,
  deliverable_type_id   uuid          not null references public.deliverable_types(id) on delete restrict,
  name                  text          not null,
  seat_time_hours       numeric(6,2)  not null check (seat_time_hours >= 0),
  quantity              integer       not null default 1 check (quantity > 0),
  complexity_multiplier numeric(4,2)  not null default 1.00
                          check (complexity_multiplier >= 0.5 and complexity_multiplier <= 3.0),
  estimated_hours       numeric(9,2)  not null default 0,  -- computed by trigger
  notes                 text,
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now(),
  created_by            uuid          references auth.users(id) on delete set null,
  updated_by            uuid          references auth.users(id) on delete set null
);

create index on public.tra_deliverables (tra_id);
create index on public.tra_deliverables (deliverable_type_id);
create index on public.tra_deliverables (org_id);

alter table public.tra_deliverables enable row level security;

create policy "tra_deliverables_select" on public.tra_deliverables
  for select using (org_id in (select public.user_org_ids()));

create policy "tra_deliverables_modify" on public.tra_deliverables
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('tra_deliverables');

create trigger set_actor_audit_fields
  before insert or update on public.tra_deliverables
  for each row execute function public.set_actor_audit_fields();

-- ── compute_deliverable_estimated_hours ──────────────────────────────────────
-- BEFORE INSERT/UPDATE on tra_deliverables: looks up dev_to_seat_ratio from
-- deliverable_types and writes the formula result to NEW.estimated_hours.
-- A generated column won't work because the formula references a different
-- table.

create or replace function public.compute_deliverable_estimated_hours()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_ratio numeric(6,2);
begin
  select dev_to_seat_ratio into v_ratio
  from public.deliverable_types
  where id = new.deliverable_type_id;

  if v_ratio is null then
    raise exception 'Unknown deliverable_type_id: %', new.deliverable_type_id
      using errcode = 'foreign_key_violation';
  end if;

  new.estimated_hours :=
    new.seat_time_hours * v_ratio * new.quantity * new.complexity_multiplier;

  return new;
end;
$$;

create trigger compute_estimated_hours
  before insert or update on public.tra_deliverables
  for each row execute function public.compute_deliverable_estimated_hours();

-- ── recompute_tra_total ──────────────────────────────────────────────────────
-- AFTER INSERT/UPDATE/DELETE on tra_deliverables: rolls up the per-deliverable
-- estimated_hours into tras.total_estimated_hours. Touches updated_at so the
-- audit trigger fires on the parent.

create or replace function public.recompute_tra_total()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_tra_id uuid;
  v_total  numeric(9,2);
begin
  v_tra_id := coalesce(new.tra_id, old.tra_id);

  select coalesce(sum(estimated_hours), 0) into v_total
  from public.tra_deliverables
  where tra_id = v_tra_id;

  update public.tras
    set total_estimated_hours = v_total,
        updated_at = now()
  where id = v_tra_id;

  return null;
end;
$$;

create trigger recompute_tra_total
  after insert or update or delete on public.tra_deliverables
  for each row execute function public.recompute_tra_total();
