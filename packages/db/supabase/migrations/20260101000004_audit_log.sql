-- ── audit_log ─────────────────────────────────────────────────────────────────
-- Immutable event log.  Only write_audit_log() (security definer) may INSERT;
-- no user-level DML policies are granted.

create table public.audit_log (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  actor_id    uuid        references auth.users(id) on delete set null,
  operation   text        not null,   -- INSERT | UPDATE | DELETE
  table_name  text        not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index on public.audit_log (org_id, created_at desc);
create index on public.audit_log (actor_id);
create index on public.audit_log (table_name, record_id);
create index on public.audit_log (operation);

alter table public.audit_log enable row level security;

create policy "members can view audit log for their org"
  on public.audit_log for select
  using (org_id = any(public.user_org_ids()));
