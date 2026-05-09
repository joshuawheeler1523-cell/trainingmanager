-- ── instructors ────────────────────────────────────────────────────────────────

create table public.instructors (
  id           uuid        not null default gen_random_uuid() primary key,
  org_id       uuid        not null references public.organizations(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  full_name    text        not null,
  email        citext,
  phone        text,
  department   text,
  location     text,
  job_title    text,
  start_date   date,
  annual_hours integer     not null default 1880,
  status       text        not null default 'active'
                             check (status in ('active', 'inactive', 'on_leave')),
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid        references auth.users(id) on delete set null,
  updated_by   uuid        references auth.users(id) on delete set null,
  version      integer     not null default 1,
  unique (org_id, email)
);

create index on public.instructors (org_id, status);
create index on public.instructors (org_id, full_name);
create index on public.instructors (org_id, deleted_at);

alter table public.instructors enable row level security;

create policy "instructors_select" on public.instructors
  for select using (org_id in (select public.user_org_ids()));

create policy "instructors_modify" on public.instructors
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('instructors');

create trigger set_actor_audit_fields
  before insert or update on public.instructors
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.instructors
  for each row execute function public.bump_version();
