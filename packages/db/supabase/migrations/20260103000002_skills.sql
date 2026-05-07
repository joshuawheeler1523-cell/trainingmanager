-- ── proficiency_rank helper ──────────────────────────────────────────────────
-- Numeric ordering for the proficiency enum so we can do >= comparisons.

create or replace function public.proficiency_rank(p_proficiency text)
  returns integer
  language sql immutable
as $$
  select case p_proficiency
    when 'beginner'     then 1
    when 'intermediate' then 2
    when 'advanced'     then 3
    when 'expert'       then 4
    else 0
  end
$$;

-- ── skills ────────────────────────────────────────────────────────────────────

create table public.skills (
  id                   uuid        not null default gen_random_uuid() primary key,
  org_id               uuid        not null references public.organizations(id) on delete cascade,
  name                 text        not null,
  category             text,
  description          text,
  is_certification     boolean     not null default false,
  certifying_authority text,
  is_archived          boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid        references auth.users(id) on delete set null,
  updated_by           uuid        references auth.users(id) on delete set null,
  unique (org_id, name)
);

create index on public.skills (org_id, is_archived);
create index on public.skills (org_id, category);

alter table public.skills enable row level security;

create policy "skills_select" on public.skills
  for select using (org_id in (select public.user_org_ids()));

create policy "skills_modify" on public.skills
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('skills');

create trigger set_actor_audit_fields
  before insert or update on public.skills
  for each row execute function public.set_actor_audit_fields();

-- ── instructor_skills ─────────────────────────────────────────────────────────

create table public.instructor_skills (
  id              uuid        not null default gen_random_uuid() primary key,
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  instructor_id   uuid        not null references public.instructors(id) on delete cascade,
  skill_id        uuid        not null references public.skills(id) on delete cascade,
  proficiency     text        not null
                                check (proficiency in ('beginner', 'intermediate', 'advanced', 'expert')),
  is_certified    boolean     not null default false,
  certified_at    date,
  expires_at      date,
  certificate_url text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references auth.users(id) on delete set null,
  updated_by      uuid        references auth.users(id) on delete set null,
  unique (instructor_id, skill_id)
);

create index on public.instructor_skills (org_id, expires_at);
create index on public.instructor_skills (skill_id);
create index on public.instructor_skills (instructor_id);

alter table public.instructor_skills enable row level security;

create policy "instructor_skills_select" on public.instructor_skills
  for select using (org_id in (select public.user_org_ids()));

create policy "instructor_skills_modify" on public.instructor_skills
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('instructor_skills');

create trigger set_actor_audit_fields
  before insert or update on public.instructor_skills
  for each row execute function public.set_actor_audit_fields();

-- ── class_skill_requirements ──────────────────────────────────────────────────

create table public.class_skill_requirements (
  id              uuid        not null default gen_random_uuid() primary key,
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  class_id        uuid        not null references public.classes(id) on delete cascade,
  skill_id        uuid        not null references public.skills(id) on delete cascade,
  min_proficiency text        not null
                                check (min_proficiency in ('beginner', 'intermediate', 'advanced', 'expert')),
  requirement     text        not null default 'required'
                                check (requirement in ('required', 'preferred')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references auth.users(id) on delete set null,
  updated_by      uuid        references auth.users(id) on delete set null,
  unique (class_id, skill_id)
);

create index on public.class_skill_requirements (class_id);
create index on public.class_skill_requirements (skill_id);
create index on public.class_skill_requirements (org_id);

alter table public.class_skill_requirements enable row level security;

create policy "csr_select" on public.class_skill_requirements
  for select using (org_id in (select public.user_org_ids()));

create policy "csr_modify" on public.class_skill_requirements
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('class_skill_requirements');

create trigger set_actor_audit_fields
  before insert or update on public.class_skill_requirements
  for each row execute function public.set_actor_audit_fields();

-- ── notifications (per data_model.md §12.3) ───────────────────────────────────

create table public.notifications (
  id           uuid        not null default gen_random_uuid() primary key,
  org_id       uuid        not null references public.organizations(id) on delete cascade,
  recipient_id uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null,
  title        text        not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index on public.notifications (org_id, recipient_id, created_at desc);
create index on public.notifications (recipient_id, read_at);

alter table public.notifications enable row level security;

-- Recipients see their own notifications. Org members can see notifications in their org.
create policy "notifications_select_own" on public.notifications
  for select using (
    recipient_id = auth.uid()
    or org_id in (select public.user_org_ids())
  );

-- Recipients can mark notifications read (UPDATE read_at).
create policy "notifications_update_own" on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ── qualified_instructors_for_class(class_id) ─────────────────────────────────
-- Returns the set of active instructors in the class's org who meet ALL
-- 'required' skill requirements at the given min_proficiency or higher.

create or replace function public.qualified_instructors_for_class(p_class_id uuid)
  returns table (instructor_id uuid)
  language sql stable security definer
  set search_path = ''
as $$
  with cls as (
    select org_id from public.classes where id = p_class_id
  ),
  required as (
    select skill_id, public.proficiency_rank(min_proficiency) as min_rank
    from public.class_skill_requirements
    where class_id = p_class_id
      and requirement = 'required'
  )
  select i.id
  from public.instructors i
  cross join cls
  where i.org_id = cls.org_id
    and i.deleted_at is null
    and i.status = 'active'
    and not exists (
      select 1 from required r
      where not exists (
        select 1 from public.instructor_skills isk
        where isk.instructor_id = i.id
          and isk.skill_id = r.skill_id
          and public.proficiency_rank(isk.proficiency) >= r.min_rank
      )
    );
$$;

-- ── notify_expiring_certifications() ──────────────────────────────────────────
-- For every certified instructor_skill expiring within 30 days, write a
-- notification to the instructor (if they have a linked auth user). Idempotent:
-- skip rows that already have a 'cert_expiring' notification for the same
-- (instructor, skill) recorded today.

create or replace function public.notify_expiring_certifications()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_window_days constant integer := 30;
begin
  insert into public.notifications (org_id, recipient_id, kind, title, body, link)
  select
    isk.org_id,
    i.user_id,
    'cert_expiring',
    'Certification expiring soon',
    format(
      '%s expires on %s (%s days).',
      s.name,
      to_char(isk.expires_at, 'YYYY-MM-DD'),
      (isk.expires_at - current_date)::text
    ),
    format('/instructors/%s', i.id)
  from public.instructor_skills isk
  join public.instructors i on i.id = isk.instructor_id and i.deleted_at is null
  join public.skills      s on s.id = isk.skill_id
  where isk.is_certified = true
    and isk.expires_at is not null
    and isk.expires_at >= current_date
    and isk.expires_at <= current_date + (v_window_days || ' days')::interval
    and i.user_id is not null
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = i.user_id
        and n.kind = 'cert_expiring'
        and n.link = format('/instructors/%s', i.id)
        and n.body like s.name || '%'
        and n.created_at >= current_date
    );
end;
$$;

-- ── pg_cron schedule: expire_certifications ───────────────────────────────────
-- 06:00 UTC daily.

select cron.schedule(
  'expire_certifications',
  '0 6 * * *',
  $cron$select public.notify_expiring_certifications();$cron$
);
