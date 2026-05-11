-- =============================================================================
-- Public status page — incidents
-- =============================================================================
-- Powers /status. Arbor admins post incidents when prod has an issue;
-- visitors see a real-time view of active incidents + 90-day history.
--
-- We don't track per-component status (database / api / dashboard separately)
-- in v1 — single platform-wide status is enough until we have multiple
-- meaningfully-independent surfaces.
-- =============================================================================

create table public.status_incidents (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  body          text,
  severity      text        not null default 'minor'
                            check (severity in ('minor', 'major', 'critical', 'maintenance')),
  status        text        not null default 'investigating'
                            check (status in (
                              'investigating', 'identified', 'monitoring', 'resolved', 'scheduled'
                            )),
  started_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.status_incidents (started_at desc);
create index on public.status_incidents (status) where status != 'resolved';

comment on table public.status_incidents is
  'Public status-page incidents. SELECT is open to anon for the public /status page; mutations restricted to service_role (managed via Arbor-admin server actions).';

alter table public.status_incidents enable row level security;

-- Public can read every incident — that's the whole point.
create policy status_incidents_public_select
  on public.status_incidents for select
  to anon, authenticated
  using (true);

-- Mutations go through server actions using the admin client (which
-- bypasses RLS). No insert/update/delete policy means RLS denies all
-- direct client writes.

-- ── Per-incident updates (timeline) ───────────────────────────────────────
-- An ongoing incident accumulates updates as the team learns more.
-- Posted to the timeline visible on /status.

create table public.status_incident_updates (
  id            uuid        primary key default gen_random_uuid(),
  incident_id   uuid        not null references public.status_incidents(id) on delete cascade,
  status        text        not null
                            check (status in (
                              'investigating', 'identified', 'monitoring', 'resolved', 'scheduled'
                            )),
  body          text        not null,
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index on public.status_incident_updates (incident_id, created_at desc);

alter table public.status_incident_updates enable row level security;

create policy status_incident_updates_public_select
  on public.status_incident_updates for select
  to anon, authenticated
  using (true);
