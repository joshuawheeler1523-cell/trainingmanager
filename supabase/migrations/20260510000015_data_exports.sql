-- =============================================================================
-- White-Label Phase 8 — Data export tracking
-- =============================================================================
-- Records every "give me my data" export the org has run. Powers GDPR/HIPAA
-- subject access requests + auditability ("what did we send, when, to whom").
--
-- The actual export ZIP lives in the `data-exports` Storage bucket (private;
-- signed URL valid for 7 days). This table only tracks the metadata.
--
-- Rollback:
--   drop table public.data_exports;
--   delete from storage.buckets where id = 'data-exports';
-- =============================================================================

create table public.data_exports (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  requested_by  uuid        references auth.users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  status        text        not null default 'queued'
                            check (status in ('queued', 'running', 'completed', 'failed')),
  storage_path  text,
  size_bytes    bigint,
  table_count   integer,
  row_count     integer,
  error_message text
);

create index on public.data_exports (org_id, requested_at desc);

comment on table public.data_exports is
  'Audit trail of org data exports (Phase 8). The ZIP bundle lives in the data-exports Storage bucket; this row records who ran it, when, and where to find it.';

alter table public.data_exports enable row level security;

-- Managers see their org's export history
create policy data_exports_select_manager
  on public.data_exports for select
  to authenticated
  using (public.is_manager(org_id));

-- Inserts come from server actions (admin client); deny direct mutations
-- via RLS by simply not creating a policy.

-- ── Storage bucket ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
  values ('data-exports', 'data-exports', false)
  on conflict (id) do nothing;

-- Path convention: {org_id}/{export_id}.zip
-- Reads via signed URL only (bucket is private). Writes restricted to
-- managers of the matching org folder.
create policy data_exports_manager_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'data-exports'
    and public.is_manager((storage.foldername(name))[1]::uuid)
  );

create policy data_exports_admin_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'data-exports'
    and public.is_manager((storage.foldername(name))[1]::uuid)
  );
