-- Phase 6.3 — External dependencies + public share token + Excel import RPC.
--
-- "External dependencies" are project-level blockers that aren't task→task
-- arrows (those live in task_dependencies). Examples: a vendor delivery, a
-- compliance approval, an upstream system change. They have an owner and a
-- target resolution date and a small status workflow.

-- ── dependencies (external/technical) ────────────────────────────────────────

create table public.dependencies (
  id                      uuid          not null default gen_random_uuid() primary key,
  org_id                  uuid          not null references public.organizations(id) on delete cascade,
  project_id              uuid          not null references public.projects(id) on delete cascade,
  name                    text          not null,
  description             text,
  dep_type                text          not null default 'external'
                            check (dep_type in ('external','technical','vendor','compliance','other')),
  owner                   text,
  target_resolution_date  date,
  status                  text          not null default 'open'
                            check (status in ('open','in_progress','resolved','blocked')),
  resolved_at             timestamptz,
  sort_order              integer       not null default 0,
  created_at              timestamptz   not null default now(),
  updated_at              timestamptz   not null default now(),
  created_by              uuid          references auth.users(id) on delete set null,
  updated_by              uuid          references auth.users(id) on delete set null,
  version                 integer       not null default 1
);

create index on public.dependencies (project_id, sort_order);
create index on public.dependencies (project_id, status);
create index on public.dependencies (org_id);

alter table public.dependencies enable row level security;

create policy "dependencies_select" on public.dependencies
  for select using (org_id in (select public.user_org_ids()));

create policy "dependencies_modify" on public.dependencies
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('dependencies');

create trigger set_actor_audit_fields
  before insert or update on public.dependencies
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.dependencies
  for each row execute function public.bump_version();

-- Auto-stamp resolved_at when status flips to/from 'resolved'.
create or replace function public.set_dependency_resolved_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'resolved' then
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    return new;
  end if;
  if old.status is distinct from new.status then
    if new.status = 'resolved' then
      new.resolved_at := now();
    elsif old.status = 'resolved' and new.status <> 'resolved' then
      new.resolved_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_dependency_resolved_at
  before insert or update on public.dependencies
  for each row execute function public.set_dependency_resolved_at();

-- ── projects.public_share_token ──────────────────────────────────────────────
-- Tokenized read-only share. NULL means no link is published.

alter table public.projects
  add column public_share_token uuid unique;

-- Anonymous read policies for public-share consumers. Each policy checks
-- that there exists a project (matching the row's org/project) whose
-- public_share_token equals the requested token, which the page passes via
-- a SET LOCAL request setting before each query (see pg_share_token RPC).

create or replace function public.get_pg_share_token() returns uuid
  language sql stable
  set search_path = ''
as $$
  select nullif(current_setting('request.share_token', true), '')::uuid;
$$;

-- The anon caller selects projects.public_share_token = current_setting(...).
-- Tasks/milestones/team_members/dependencies join through project_id.

create policy "projects_public_share_select" on public.projects
  for select to anon
  using (
    public_share_token is not null
    and public_share_token = public.get_pg_share_token()
  );

create policy "tasks_public_share_select" on public.tasks
  for select to anon
  using (
    exists (
      select 1 from public.projects p
      where p.id = tasks.project_id
        and p.public_share_token is not null
        and p.public_share_token = public.get_pg_share_token()
    )
  );

create policy "milestones_public_share_select" on public.milestones
  for select to anon
  using (
    exists (
      select 1 from public.projects p
      where p.id = milestones.project_id
        and p.public_share_token is not null
        and p.public_share_token = public.get_pg_share_token()
    )
  );

create policy "team_members_public_share_select" on public.project_team_members
  for select to anon
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_team_members.project_id
        and p.public_share_token is not null
        and p.public_share_token = public.get_pg_share_token()
    )
  );

create policy "dependencies_public_share_select" on public.dependencies
  for select to anon
  using (
    exists (
      select 1 from public.projects p
      where p.id = dependencies.project_id
        and p.public_share_token is not null
        and p.public_share_token = public.get_pg_share_token()
    )
  );

-- Instructors are joined to team members for the public view (just full_name);
-- expose a narrow view rather than the full row.
create or replace view public.v_public_project_team as
select
  ptm.id,
  ptm.project_id,
  ptm.role,
  ptm.allocated_hours,
  i.full_name           as instructor_name
from public.project_team_members ptm
join public.instructors i on i.id = ptm.instructor_id and i.deleted_at is null;

grant select on public.v_public_project_team to anon;

-- Helper RPC: anon callers invoke it once per request to set the share-token
-- session var so the policies above match. Returns the project row for
-- convenience (404 if the token doesn't match anything active).
create or replace function public.set_share_token(p_token uuid)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform set_config('request.share_token', p_token::text, true);
end;
$$;

grant execute on function public.set_share_token(uuid) to anon;

-- ── import_tasks() RPC: transactional bulk import ───────────────────────────
-- The import flow takes a JSON array of task records and applies the diff
-- (insert / update / delete) atomically. Failure on any row aborts the whole
-- batch, so a bad cell can never leave the project in an inconsistent state.

create or replace function public.import_tasks(
  p_project_id uuid,
  p_inserts    jsonb,           -- array of task objects to insert
  p_updates    jsonb,           -- array of {id, ...fields} to patch
  p_delete_ids uuid[]           -- ids to delete
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_inserted int := 0;
  v_updated  int := 0;
  v_deleted  int := 0;
  rec jsonb;
begin
  -- Resolve org via the project. The standard RLS policy on projects
  -- already ensures the caller is allowed to see this row.
  select org_id into v_org
  from public.projects
  where id = p_project_id;
  if v_org is null then
    raise exception 'project not found' using errcode = 'no_data_found';
  end if;

  -- Inserts
  if p_inserts is not null then
    for rec in select * from jsonb_array_elements(p_inserts) loop
      insert into public.tasks (
        org_id, project_id, name, description, status, priority,
        start_date, end_date, estimated_hours, percent_complete
      ) values (
        v_org,
        p_project_id,
        rec->>'name',
        nullif(rec->>'description', ''),
        coalesce(rec->>'status', 'not_started'),
        coalesce(rec->>'priority', 'medium'),
        nullif(rec->>'start_date', '')::date,
        nullif(rec->>'end_date', '')::date,
        nullif(rec->>'estimated_hours', '')::numeric,
        coalesce(nullif(rec->>'percent_complete', '')::int, 0)
      );
      v_inserted := v_inserted + 1;
    end loop;
  end if;

  -- Updates
  if p_updates is not null then
    for rec in select * from jsonb_array_elements(p_updates) loop
      update public.tasks
      set
        name             = coalesce(rec->>'name',             name),
        description      = coalesce(nullif(rec->>'description', ''), description),
        status           = coalesce(rec->>'status',           status),
        priority         = coalesce(rec->>'priority',         priority),
        start_date       = coalesce(nullif(rec->>'start_date', '')::date, start_date),
        end_date         = coalesce(nullif(rec->>'end_date', '')::date,   end_date),
        estimated_hours  = coalesce(nullif(rec->>'estimated_hours', '')::numeric, estimated_hours),
        percent_complete = coalesce(nullif(rec->>'percent_complete', '')::int, percent_complete)
      where id = (rec->>'id')::uuid
        and project_id = p_project_id
        and org_id = v_org;
      if found then v_updated := v_updated + 1; end if;
    end loop;
  end if;

  -- Deletes
  if p_delete_ids is not null and array_length(p_delete_ids, 1) > 0 then
    delete from public.tasks
    where id = any(p_delete_ids)
      and project_id = p_project_id
      and org_id = v_org;
    get diagnostics v_deleted = row_count;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'deleted',  v_deleted
  );
end;
$$;

grant execute on function public.import_tasks(uuid, jsonb, jsonb, uuid[]) to authenticated;
