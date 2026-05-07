-- ── audit_log ─────────────────────────────────────────────────────────────────
-- Immutable event log. Written exclusively by the write_audit_log() trigger
-- (security definer). No FK on org_id — the AFTER DELETE trigger on organizations
-- fires after the org row is gone, which would violate the constraint.

create table public.audit_log (
  id             bigint      generated always as identity primary key,
  org_id         uuid        not null,
  actor_id       uuid        references auth.users(id) on delete set null,
  operation      text        not null,        -- INSERT | UPDATE | DELETE
  table_name     text        not null,
  record_id      uuid        not null,
  changed_fields text[],                      -- UPDATE only
  old_values     jsonb,                       -- UPDATE / DELETE
  new_values     jsonb,                       -- INSERT / UPDATE
  occurred_at    timestamptz not null default now()
);

create index on public.audit_log (org_id, occurred_at desc);
create index on public.audit_log (org_id, table_name, record_id);
create index on public.audit_log (actor_id, occurred_at desc);

alter table public.audit_log enable row level security;

create policy "members can view audit log for their org"
  on public.audit_log for select
  using (org_id in (select public.user_org_ids()));
