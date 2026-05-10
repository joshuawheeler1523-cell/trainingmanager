-- =============================================================================
-- White-Label Phase 5 — Manual billing: contracts + invoices
-- =============================================================================
-- Per docs/build-plans/2026-05-09_white-label-reseller.md §5 (Phase 5).
--
-- No Stripe. Arbor bills agencies manually. The platform records contracts
-- + monthly rev share + invoices + payments and produces invoice PDFs via
-- a separate route.
--
-- New tables:
--   public.client_contracts  — one row per agency-client deal; the source
--     of truth for what Arbor will bill the agency
--   public.arbor_invoices    — Arbor's monthly bill to the agency, summing
--     rev share owed across all the agency's active contracts
--
-- Schema additions:
--   agencies.billing_email          — where Arbor sends invoice notifications
--   agencies.billing_address        — bill-to address rendered on PDF invoices
--   agencies.payment_terms_days     — default 30 (Net 30)
--   agencies.default_revenue_share_pct — Arbor's cut as a basis-point integer
--                                         (default 3000 = 30.00%); per-contract
--                                         override allowed
--
-- New helpers:
--   public.next_invoice_number()    — atomically returns the next sequential
--                                      invoice number across all agencies
--                                      (`ARB-YYYY-NNNNN`)
--   public.calculate_period_rev_share(agency_id, period_start, period_end)
--                                   — sums rev share owed for the period
--                                      across all active contracts
--
-- RLS:
--   agency_admin can SELECT both tables for their own agency.
--   Mutations are server-action gated (uses admin client / service role).
--   No direct INSERT/UPDATE/DELETE policies for authenticated role —
--   forces all writes through audited server actions.
--
-- DOWN:
--   drop function if exists public.calculate_period_rev_share(uuid, date, date);
--   drop function if exists public.next_invoice_number();
--   drop sequence if exists public.arbor_invoice_seq;
--   drop table if exists public.arbor_invoices;
--   drop table if exists public.client_contracts;
--   alter table public.agencies
--     drop column default_revenue_share_pct,
--     drop column payment_terms_days,
--     drop column billing_address,
--     drop column billing_email;
-- =============================================================================

-- ── 1. agencies billing columns ────────────────────────────────────────────

alter table public.agencies
  add column billing_email                text,
  add column billing_address              text,
  add column payment_terms_days           integer not null default 30
    check (payment_terms_days between 0 and 180),
  add column default_revenue_share_pct    integer not null default 3000
    check (default_revenue_share_pct between 0 and 10000);

comment on column public.agencies.default_revenue_share_pct is
  'Arbor''s share as basis points (3000 = 30.00%). Per-contract override possible. 0–10000 (0%–100%).';

-- ── 2. client_contracts table ──────────────────────────────────────────────

create type public.contract_pricing_tier as enum (
  'small',       -- < 25 active users    (~$30k retail)
  'medium',      -- 25–100               (~$50k retail)
  'large',       -- 100–500              (~$75k retail)
  'enterprise'   -- 500+                 (custom retail)
);

create type public.contract_status as enum (
  'trial',       -- onboarding period; no rev share owed
  'active',      -- live; rev share calculated for invoice generation
  'expired',     -- contract end date passed; no future invoices
  'cancelled'    -- terminated early by either party
);

create table public.client_contracts (
  id                              uuid        primary key default gen_random_uuid(),
  agency_id                       uuid        not null references public.agencies(id) on delete restrict,
  org_id                          uuid        not null references public.organizations(id) on delete restrict,
  pricing_tier                    public.contract_pricing_tier not null,
  annual_contract_value_cents     bigint      not null check (annual_contract_value_cents >= 0),
  -- per-contract rev share override; if NULL, uses agencies.default_revenue_share_pct
  revenue_share_pct               integer     check (revenue_share_pct between 0 and 10000),
  contract_start                  date        not null,
  contract_end                    date,        -- NULL = open-ended (rare; usually annual renewal)
  status                          public.contract_status not null default 'trial',
  notes                           text,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid        references auth.users(id) on delete set null,
  updated_by                      uuid        references auth.users(id) on delete set null,
  version                         integer     not null default 1,

  -- One active or trial contract per agency-org pair at a time. Renewals
  -- create a new row after the prior is set to 'expired'.
  constraint client_contracts_status_dates check (
    contract_end is null or contract_end >= contract_start
  )
);

create index on public.client_contracts (agency_id);
create index on public.client_contracts (org_id);
create index on public.client_contracts (status);
create unique index client_contracts_one_active_per_pair
  on public.client_contracts (agency_id, org_id)
  where status in ('trial', 'active');

comment on table public.client_contracts is
  'One row per agency-client deal. Source of truth for invoice generation. Trial/active contracts get billed; expired/cancelled do not.';

alter table public.client_contracts enable row level security;

-- agency_admin can SELECT contracts for their own agency
create policy client_contracts_select_agency
  on public.client_contracts for select
  using (public.is_agency_admin(agency_id));

-- All writes go through server actions using the admin client. No direct
-- INSERT/UPDATE/DELETE policies for the authenticated role.

create trigger set_updated_at
  before update on public.client_contracts
  for each row execute function public.set_updated_at();

create trigger set_actor_audit_fields
  before insert or update on public.client_contracts
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.client_contracts
  for each row execute function public.bump_version();

-- ── 3. arbor_invoices table ────────────────────────────────────────────────

create type public.invoice_status as enum (
  'draft',       -- generated by cron; not yet sent
  'sent',        -- emailed/delivered to agency
  'paid',        -- payment received + recorded
  'overdue',     -- past due_at + still unpaid; flagged by daily cron
  'void',        -- cancelled/corrected without payment
  'cancelled'    -- agency cancelled before sending
);

create type public.payment_method as enum (
  'check',
  'wire',
  'ach',
  'zelle',
  'paypal',
  'other'
);

-- Sequential invoice numbers across all agencies for clean accounting.
create sequence if not exists public.arbor_invoice_seq;

create table public.arbor_invoices (
  id                  uuid        primary key default gen_random_uuid(),
  invoice_number      text        not null unique, -- ARB-YYYY-NNNNN format
  agency_id           uuid        not null references public.agencies(id) on delete restrict,
  period_start        date        not null,
  period_end          date        not null,
  issued_at           timestamptz not null default now(),
  due_at              date        not null,
  total_cents         bigint      not null check (total_cents >= 0),
  status              public.invoice_status not null default 'draft',
  payment_provider    text        not null default 'manual',  -- forward-compat for stripe later
  -- Snapshot of the contracts billed this period (in case contracts change later)
  -- Shape: [{contract_id, org_id, org_name, tier, annual_value_cents, share_pct, period_share_cents}]
  line_items          jsonb       not null default '[]'::jsonb,
  paid_at             timestamptz,
  paid_method         public.payment_method,
  paid_reference      text,        -- check #, wire confirmation, etc.
  paid_amount_cents   bigint      check (paid_amount_cents is null or paid_amount_cents >= 0),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid        references auth.users(id) on delete set null,
  updated_by          uuid        references auth.users(id) on delete set null,

  constraint arbor_invoices_paid_consistent check (
    (status = 'paid' and paid_at is not null) or
    (status <> 'paid')
  ),
  constraint arbor_invoices_period_valid check (period_end >= period_start)
);

create index on public.arbor_invoices (agency_id);
create index on public.arbor_invoices (status);
create index on public.arbor_invoices (period_start, period_end);
create index on public.arbor_invoices (due_at) where status in ('sent', 'overdue');

comment on table public.arbor_invoices is
  'Arbor''s monthly bill to each agency. invoice_number is sequential across all agencies (ARB-YYYY-NNNNN). line_items is a snapshot of contracts billed in case contracts change later.';

alter table public.arbor_invoices enable row level security;

-- agency_admin can SELECT invoices for their own agency
create policy arbor_invoices_select_agency
  on public.arbor_invoices for select
  using (public.is_agency_admin(agency_id));

-- Writes via server action / admin client. No direct policies.

create trigger set_updated_at
  before update on public.arbor_invoices
  for each row execute function public.set_updated_at();

create trigger set_actor_audit_fields
  before insert or update on public.arbor_invoices
  for each row execute function public.set_actor_audit_fields();

-- ── 4. Helper: generate next invoice number ────────────────────────────────

create or replace function public.next_invoice_number()
  returns text
  language plpgsql
  set search_path = ''
as $$
declare
  v_seq    bigint;
  v_year   text := to_char(now(), 'YYYY');
begin
  v_seq := nextval('public.arbor_invoice_seq');
  return 'ARB-' || v_year || '-' || lpad(v_seq::text, 5, '0');
end;
$$;

comment on function public.next_invoice_number() is
  'Atomically returns the next sequential invoice number (ARB-YYYY-NNNNN). Sequence is global across all agencies for accounting clarity.';

-- ── 5. Helper: calculate period rev share for an agency ───────────────────

create or replace function public.calculate_period_rev_share(
  p_agency_id    uuid,
  p_period_start date,
  p_period_end   date
)
  returns table (
    contract_id              uuid,
    org_id                   uuid,
    org_name                 text,
    pricing_tier             public.contract_pricing_tier,
    annual_value_cents       bigint,
    effective_share_pct      integer,
    period_share_cents       bigint
  )
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_default_pct integer;
  v_period_days integer := (p_period_end - p_period_start + 1);
begin
  select default_revenue_share_pct into v_default_pct
    from public.agencies where id = p_agency_id;
  if v_default_pct is null then
    raise exception 'Agency % not found', p_agency_id;
  end if;

  return query
  select
    c.id,
    c.org_id,
    o.name,
    c.pricing_tier,
    c.annual_contract_value_cents,
    coalesce(c.revenue_share_pct, v_default_pct),
    -- annual_value × share_pct × (period_days / 365), all in basis points
    -- rounded to nearest cent (floor for safety).
    floor(
      c.annual_contract_value_cents
      * coalesce(c.revenue_share_pct, v_default_pct)::numeric
      / 10000
      * v_period_days::numeric
      / 365
    )::bigint
  from public.client_contracts c
  join public.organizations o on o.id = c.org_id
  where c.agency_id = p_agency_id
    and c.status = 'active'
    and c.contract_start <= p_period_end
    and (c.contract_end is null or c.contract_end >= p_period_start);
end;
$$;

comment on function public.calculate_period_rev_share(uuid, date, date) is
  'Returns one row per active contract for the agency during the given period, with the rev-share dollars owed for that contract''s portion of the period. Trial/expired/cancelled contracts excluded.';
