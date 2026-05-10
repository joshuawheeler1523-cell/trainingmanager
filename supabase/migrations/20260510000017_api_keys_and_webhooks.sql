-- =============================================================================
-- White-Label Phase 6 — Public REST API + outbound webhooks
-- =============================================================================
-- Two adjacent surfaces:
--   1. api_keys              — Bearer-token auth for /api/v1/* endpoints
--   2. webhook_endpoints     — outbound HTTP callbacks the customer registers
--   3. webhook_deliveries    — per-attempt log with retry state
--
-- Both are PER-ORG (not per-agency) so a leaked hospital key can't reach
-- the agency's other clients.
-- =============================================================================

-- ── 1. api_keys ────────────────────────────────────────────────────────────

create table public.api_keys (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  name          text        not null,                 -- "Workday sync", "HRIS import"
  key_prefix    text        not null,                 -- first 12 chars (e.g. arbor_live_) for display
  key_hash      text        not null,                 -- bcrypt hash of full key (verified at auth time)
  scopes        text[]      not null default array['read', 'write'],
  created_by    uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index on public.api_keys (org_id);
-- Lookup by prefix narrows the bcrypt search space; we hash-compare only
-- the candidate row(s) instead of every key in the table.
create index on public.api_keys (key_prefix) where revoked_at is null;

comment on table public.api_keys is
  'Bearer tokens for /api/v1/* access. Full key is shown ONCE on creation; only key_hash (bcrypt) is stored.';

alter table public.api_keys enable row level security;

create policy api_keys_select_manager
  on public.api_keys for select
  to authenticated
  using (public.is_manager(org_id));

create policy api_keys_insert_manager
  on public.api_keys for insert
  to authenticated
  with check (public.is_manager(org_id));

create policy api_keys_update_manager
  on public.api_keys for update
  to authenticated
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

-- ── 2. webhook_endpoints ───────────────────────────────────────────────────

create table public.webhook_endpoints (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  url             text        not null,
  events          text[]      not null default array[]::text[],  -- e.g. ['tra.created', 'class.completed']
  signing_secret  text        not null,                          -- HMAC SHA-256 secret
  enabled         boolean     not null default true,
  description     text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.webhook_endpoints (org_id);
create index on public.webhook_endpoints using gin (events);

comment on table public.webhook_endpoints is
  'Customer-registered HTTP endpoints to receive event callbacks. Payloads are signed with HMAC SHA-256 of signing_secret in X-Arbor-Signature header.';

alter table public.webhook_endpoints enable row level security;

create policy webhook_endpoints_select_manager
  on public.webhook_endpoints for select
  to authenticated
  using (public.is_manager(org_id));

create policy webhook_endpoints_insert_manager
  on public.webhook_endpoints for insert
  to authenticated
  with check (public.is_manager(org_id));

create policy webhook_endpoints_update_manager
  on public.webhook_endpoints for update
  to authenticated
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

create policy webhook_endpoints_delete_manager
  on public.webhook_endpoints for delete
  to authenticated
  using (public.is_manager(org_id));

-- ── 3. webhook_deliveries ──────────────────────────────────────────────────

create table public.webhook_deliveries (
  id               uuid        primary key default gen_random_uuid(),
  endpoint_id      uuid        not null references public.webhook_endpoints(id) on delete cascade,
  org_id           uuid        not null references public.organizations(id) on delete cascade,
  event_type       text        not null,
  payload          jsonb       not null,
  status           text        not null default 'pending'
                               check (status in ('pending', 'delivered', 'failed', 'retrying')),
  attempts         integer     not null default 0,
  response_code    integer,
  response_body    text,
  next_attempt_at  timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index on public.webhook_deliveries (org_id, created_at desc);
create index on public.webhook_deliveries (endpoint_id, created_at desc);
-- Pending/retrying queue scan
create index on public.webhook_deliveries (next_attempt_at)
  where status in ('pending', 'retrying');

comment on table public.webhook_deliveries is
  'Per-attempt log. Delivery happens inline at event time; retries via the next_attempt_at queue (5 attempts with exponential backoff). Replayable from /admin/settings/webhooks.';

alter table public.webhook_deliveries enable row level security;

create policy webhook_deliveries_select_manager
  on public.webhook_deliveries for select
  to authenticated
  using (public.is_manager(org_id));
