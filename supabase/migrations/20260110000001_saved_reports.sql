-- Phase 8.1 — Saved reports + run history.
--
-- Saved reports are user-named templates of (slug, filters) that the user
-- can re-open later. Reports are scoped per-org; the org_visibility flag
-- lets a user share a saved report with the rest of the org instead of
-- keeping it private.
--
-- report_runs records each export (slug, filters, format, who, when). For
-- Phase 8.1 we don't store the file itself — exports are streamed straight
-- to the browser. The run row exists so admins can audit "who pulled what
-- when" and the saved-reports UI can show "last run".

-- ── saved_reports ───────────────────────────────────────────────────────────

create table public.saved_reports (
  id              uuid          not null default gen_random_uuid() primary key,
  org_id          uuid          not null references public.organizations(id) on delete cascade,
  slug            text          not null,                         -- one of the registry keys
  name            text          not null,
  description     text,
  filters         jsonb         not null default '{}'::jsonb,     -- caller-defined per slug
  org_visibility  boolean       not null default false,           -- true = visible to all org members
  schedule_cron   text,                                           -- Phase 10 will activate
  last_run_at     timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          references auth.users(id) on delete set null,
  updated_by      uuid          references auth.users(id) on delete set null,
  version         integer       not null default 1
);

create index on public.saved_reports (org_id, slug);
create index on public.saved_reports (org_id, created_by);

alter table public.saved_reports enable row level security;

-- Owners always see their own; org_visibility=true rows are visible to all
-- members of the org.
create policy "saved_reports_select" on public.saved_reports
  for select using (
    org_id in (select public.user_org_ids())
    and (org_visibility = true or created_by = auth.uid())
  );

-- Modifications: only the creator can edit/delete (other org members can
-- copy a shared report and save their own variant).
create policy "saved_reports_modify_own" on public.saved_reports
  for all using (
    org_id in (select public.user_org_ids())
    and created_by = auth.uid()
  )
  with check (
    org_id in (select public.user_org_ids())
    and created_by = auth.uid()
  );

select public.apply_standard_triggers('saved_reports');

create trigger set_actor_audit_fields
  before insert or update on public.saved_reports
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.saved_reports
  for each row execute function public.bump_version();

-- ── report_runs ─────────────────────────────────────────────────────────────

create table public.report_runs (
  id                uuid          not null default gen_random_uuid() primary key,
  org_id            uuid          not null references public.organizations(id) on delete cascade,
  slug              text          not null,
  saved_report_id   uuid          references public.saved_reports(id) on delete set null,
  filters           jsonb         not null default '{}'::jsonb,
  format            text          not null check (format in ('pdf','xlsx','csv','preview')),
  row_count         integer,
  duration_ms       integer,
  ran_at            timestamptz   not null default now(),
  ran_by            uuid          references auth.users(id) on delete set null
);

create index on public.report_runs (org_id, ran_at desc);
create index on public.report_runs (saved_report_id);
create index on public.report_runs (org_id, slug, ran_at desc);

alter table public.report_runs enable row level security;

-- Anyone in the org can see the run history (so admins can audit). Insertion
-- happens server-side on every export; updates aren't allowed (history is
-- append-only).
create policy "report_runs_select" on public.report_runs
  for select using (org_id in (select public.user_org_ids()));

create policy "report_runs_insert" on public.report_runs
  for insert with check (org_id in (select public.user_org_ids()));

-- Convenience: bump saved_reports.last_run_at when a run is recorded against
-- it. Lets the saved-reports list sort by recently-used.
create or replace function public.bump_saved_report_last_run()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.saved_report_id is not null then
    update public.saved_reports
       set last_run_at = new.ran_at
     where id = new.saved_report_id
       and org_id = new.org_id;
  end if;
  return new;
end;
$$;

create trigger bump_saved_report_last_run
  after insert on public.report_runs
  for each row execute function public.bump_saved_report_last_run();
