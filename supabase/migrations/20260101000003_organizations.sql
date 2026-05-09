-- ── organizations ─────────────────────────────────────────────────────────────

create table public.organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          citext      not null unique,
  time_zone     text        not null default 'America/New_York',
  settings      jsonb       not null default '{}',
  billing_tier  text,
  onboarded_at  timestamptz,
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid        references auth.users(id) on delete set null,
  updated_by    uuid        references auth.users(id) on delete set null,
  version       integer     not null default 1
);

alter table public.organizations enable row level security;

create policy "members can view their org"
  on public.organizations for select
  using (id in (select public.user_org_ids()));

create policy "org admins can update their org"
  on public.organizations for update
  using (public.is_org_admin(id));

select public.apply_standard_triggers('organizations');

create trigger set_actor_audit_fields
  before insert or update on public.organizations
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.organizations
  for each row execute function public.bump_version();

-- ── org_memberships ───────────────────────────────────────────────────────────

create table public.org_memberships (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  role          text        not null default 'member' check (role in ('member', 'org_admin')),
  visibility    text        not null default 'full' check (visibility in ('full', 'limited')),
  display_name  text,
  invited_at    timestamptz,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, user_id)
);

create index on public.org_memberships (user_id);
create index on public.org_memberships (org_id);

alter table public.org_memberships enable row level security;

create policy "members can view memberships in their orgs"
  on public.org_memberships for select
  using (org_id in (select public.user_org_ids()));

create policy "org admins can insert members"
  on public.org_memberships for insert
  with check (public.is_org_admin(org_id));

create policy "org admins can update members"
  on public.org_memberships for update
  using (public.is_org_admin(org_id));

create policy "org admins can delete members"
  on public.org_memberships for delete
  using (public.is_org_admin(org_id));

create trigger set_updated_at
  before update on public.org_memberships
  for each row execute function public.set_updated_at();

-- ── org_invitations ───────────────────────────────────────────────────────────

create table public.org_invitations (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  email       citext      not null,
  role        text        not null default 'member' check (role in ('member', 'org_admin')),
  visibility  text        not null default 'full',
  token       text        not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index on public.org_invitations (org_id);
create index on public.org_invitations (email);
create index on public.org_invitations (token);

alter table public.org_invitations enable row level security;

create policy "org admins can manage invitations"
  on public.org_invitations for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));
