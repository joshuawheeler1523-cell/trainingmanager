-- ── education_requests ───────────────────────────────────────────────────────
-- The intake queue for stakeholder-submitted training requests. Submission can
-- come from internal users (submitted_via = 'app') or from anonymous public
-- intake forms (submitted_via = 'public_form' + public_form_token).

create table public.education_requests (
  id                       uuid        not null default gen_random_uuid() primary key,
  org_id                   uuid        not null references public.organizations(id) on delete cascade,
  title                    text        not null,
  requested_by_name        text        not null,
  requested_by_email       citext,
  requested_by_department  text,
  business_justification   text,
  target_audience          text,
  urgency                  text        not null default 'standard'
                             check (urgency in ('low','standard','high','urgent')),
  target_completion_date   date,
  status                   text        not null default 'new'
                             check (status in ('new','under_review','approved','assigned','in_progress','completed','archived','rejected')),
  review_notes             text,
  linked_tra_id            uuid        references public.tras(id) on delete set null,
  linked_project_id        uuid        references public.projects(id) on delete set null,
  submitted_via            text        not null default 'app'
                             check (submitted_via in ('app','public_form')),
  public_form_token        uuid,        -- populated for public_form submissions; FK below
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid        references auth.users(id) on delete set null,
  updated_by               uuid        references auth.users(id) on delete set null
);

create index on public.education_requests (org_id, status, created_at desc);
create index on public.education_requests (org_id, urgency);
create index on public.education_requests (org_id, deleted_at);

alter table public.education_requests enable row level security;

-- Internal-user policies (standard tenant scope)
create policy "education_requests_select" on public.education_requests
  for select using (org_id in (select public.user_org_ids()));

create policy "education_requests_modify" on public.education_requests
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('education_requests');

create trigger set_actor_audit_fields
  before insert or update on public.education_requests
  for each row execute function public.set_actor_audit_fields();

-- ── education_request_assignments ───────────────────────────────────────────

create table public.education_request_assignments (
  id              uuid          not null default gen_random_uuid() primary key,
  org_id          uuid          not null references public.organizations(id) on delete cascade,
  request_id      uuid          not null references public.education_requests(id) on delete cascade,
  instructor_id   uuid          not null references public.instructors(id) on delete cascade,
  estimated_hours numeric(7,2)  not null check (estimated_hours >= 0),
  actual_hours    numeric(7,2),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          references auth.users(id) on delete set null,
  updated_by      uuid          references auth.users(id) on delete set null,
  unique (request_id, instructor_id)
);

create index on public.education_request_assignments (request_id);
create index on public.education_request_assignments (instructor_id);
create index on public.education_request_assignments (org_id);

alter table public.education_request_assignments enable row level security;

create policy "education_request_assignments_select" on public.education_request_assignments
  for select using (org_id in (select public.user_org_ids()));

create policy "education_request_assignments_modify" on public.education_request_assignments
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('education_request_assignments');

create trigger set_actor_audit_fields
  before insert or update on public.education_request_assignments
  for each row execute function public.set_actor_audit_fields();

-- ── education_request_history ───────────────────────────────────────────────
-- Status-transition audit. The trigger below writes a row each time
-- education_requests.status changes (or on initial insert).

create table public.education_request_history (
  id          bigint                  primary key generated always as identity,
  org_id      uuid                    not null references public.organizations(id) on delete cascade,
  request_id  uuid                    not null references public.education_requests(id) on delete cascade,
  from_status text,
  to_status   text                    not null,
  comment     text,
  actor_id    uuid                    references auth.users(id) on delete set null,
  occurred_at timestamptz             not null default now()
);

create index on public.education_request_history (request_id, occurred_at desc);
create index on public.education_request_history (org_id, occurred_at desc);

alter table public.education_request_history enable row level security;

create policy "education_request_history_select" on public.education_request_history
  for select using (org_id in (select public.user_org_ids()));

-- INSERT is performed exclusively by the trigger (security definer); no
-- write policy is needed for the user-facing API.

-- Status-change trigger: fires on INSERT (initial status) and on UPDATE when
-- status changed. Writes a single history row.

create or replace function public.write_request_history()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_from  text;
  v_to    text;
begin
  if tg_op = 'INSERT' then
    v_from := null;
    v_to   := new.status;
  elsif tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then
      return null; -- nothing to record
    end if;
    v_from := old.status;
    v_to   := new.status;
  else
    return null;
  end if;

  insert into public.education_request_history
    (org_id, request_id, from_status, to_status, comment, actor_id)
  values (new.org_id, new.id, v_from, v_to, new.review_notes, v_actor);
  return null;
end;
$$;

create trigger write_request_history
  after insert or update on public.education_requests
  for each row execute function public.write_request_history();

-- ── public_intake_links ─────────────────────────────────────────────────────
-- Tokenized public intake URLs. Each link can be deactivated or expired.
-- Anonymous submissions to /public/request/<token> validate against this.

create table public.public_intake_links (
  id          uuid          not null default gen_random_uuid() primary key,
  org_id      uuid          not null references public.organizations(id) on delete cascade,
  token       uuid          not null unique default gen_random_uuid(),
  label       text,
  is_active   boolean       not null default true,
  expires_at  timestamptz,
  created_by  uuid          references auth.users(id) on delete set null,
  created_at  timestamptz   not null default now()
);

create index on public.public_intake_links (org_id, is_active);
create unique index on public.public_intake_links (token);

alter table public.public_intake_links enable row level security;

-- Internal users in the org can read/manage their org's links.
create policy "intake_links_select_internal" on public.public_intake_links
  for select using (org_id in (select public.user_org_ids()));

create policy "intake_links_modify_internal" on public.public_intake_links
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- Anonymous role needs to read just the token row to validate the public
-- form. The lookup happens in is_token_active() below; we still grant a
-- narrow SELECT policy so the function can be called via PostgREST if
-- desired. The is_active + expires_at check happens in the function itself.
create policy "intake_links_select_public_anon" on public.public_intake_links
  for select to anon
  using (
    is_active = true
    and (expires_at is null or expires_at > now())
  );

-- Now that public_intake_links exists, complete the FK on
-- education_requests.public_form_token.
alter table public.education_requests
  add constraint education_requests_public_form_token_fkey
  foreign key (public_form_token)
  references public.public_intake_links(token)
  on delete set null;

-- ── Public-anon INSERT policy on education_requests ─────────────────────────
-- Allows the anon role to insert exactly one row per submission, only when:
--   - submitted_via = 'public_form'
--   - status = 'new'
--   - public_form_token references an active, non-expired intake link
--   - org_id matches the link's org_id
-- The anon role CANNOT update or read records back.

create policy "education_requests_insert_public_anon" on public.education_requests
  for insert to anon
  with check (
    submitted_via = 'public_form'
    and status = 'new'
    and public_form_token is not null
    and exists (
      select 1 from public.public_intake_links pil
      where pil.token = education_requests.public_form_token
        and pil.org_id = education_requests.org_id
        and pil.is_active = true
        and (pil.expires_at is null or pil.expires_at > now())
    )
  );

-- ── notify_aging_requests() + pg_cron ───────────────────────────────────────
-- Daily job: any request stuck in 'new' or 'under_review' for >5 business
-- days creates a 'request_aging' notification for the actor who last
-- touched it (created_by). Idempotent: skips if a same-day notification for
-- the same recipient + request already exists.

create or replace function public.notify_aging_requests()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_threshold interval := interval '5 days'; -- approximation; weekends are
                                             -- not subtracted in v1
begin
  insert into public.notifications (org_id, recipient_id, kind, title, body, link)
  select
    er.org_id,
    er.created_by,
    'request_aging',
    'Education request needs review',
    format(
      '"%s" has been in %s for %s days.',
      er.title,
      er.status,
      (current_date - er.created_at::date)::text
    ),
    format('/request-queue?focus=%s', er.id)
  from public.education_requests er
  where er.deleted_at is null
    and er.status in ('new','under_review')
    and er.created_at <= now() - v_threshold
    and er.created_by is not null
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = er.created_by
        and n.kind = 'request_aging'
        and n.link = format('/request-queue?focus=%s', er.id)
        and n.created_at >= current_date
    );
end;
$$;

select cron.schedule(
  'request_aging_notification',
  '0 8 * * *',
  $cron$select public.notify_aging_requests();$cron$
);

-- ── Extend v_instructor_workload with Source 6 (education_request) ──────────
-- Per data_model §11.1. Annual-hours contribution = era.estimated_hours.
-- Only requests in approved/assigned/in_progress contribute; everything else
-- is excluded so cancelled/rejected work doesn't count toward capacity.

create or replace view public.v_instructor_workload as
-- Source 1: Classes
select
  c.org_id                as org_id,
  cia.instructor_id       as instructor_id,
  'class'                 as source,
  c.id                    as source_id,
  c.name                  as source_label,
  cia.assigned_offerings  as quantity,
  ((case when c.is_multi_day and c.custom_day_hours is not null
      then (select sum(h) from unnest(c.custom_day_hours) h)
      else coalesce(c.hours_per_day, 0) * c.total_days end)
   + c.prep_hours_per_offering + c.logistics_hours_per_offering
  ) * cia.assigned_offerings as annual_hours,
  c.allocation_bucket_id  as bucket_id
from public.class_instructor_assignments cia
join public.classes c on c.id = cia.class_id and c.deleted_at is null
where cia.assigned_offerings > 0

union all
-- Source 2: Recurring tasks
select
  rt.org_id,
  rta.instructor_id,
  'recurring_task',
  rt.id,
  rt.name,
  null::integer,
  rt.hours_per_occurrence
    * coalesce(rt.occurrences_per_year, public.frequency_to_annual(rt.frequency))
    * (rta.share_percent / 100.0),
  rt.bucket_id
from public.recurring_task_assignments rta
join public.recurring_tasks rt
  on rt.id = rta.recurring_task_id
 and rt.deleted_at is null
where rt.status = 'active'

union all
-- Source 5: Ad-hoc tasks
select
  aht.org_id,
  aht.instructor_id,
  'ad_hoc_task',
  aht.id,
  aht.name,
  null::integer,
  aht.hours,
  aht.bucket_id
from public.ad_hoc_tasks aht
where aht.instructor_id is not null
  and aht.status in ('open','in_progress')

union all
-- Source 6: Education request assignments (NEW in Phase 5)
select
  era.org_id,
  era.instructor_id,
  'education_request',
  er.id,
  er.title,
  null::integer,
  era.estimated_hours,
  null::uuid                          as bucket_id  -- requests aren't bucketed yet
from public.education_request_assignments era
join public.education_requests er
  on er.id = era.request_id
 and er.deleted_at is null
where er.status in ('approved','assigned','in_progress');
