-- =============================================================================
-- White-Label Phase 5e — Monthly invoice generation
-- =============================================================================
-- One callable SQL function:
--   public.generate_monthly_invoices_for_period(period_start, period_end)
--     → For every agency with at least one active client_contract during the
--       period, generates an arbor_invoice row (status='draft', payment_provider
--       ='manual'). Idempotent: skips agencies that already have an invoice
--       for the exact same period.
--
-- Wiring options (pick ONE for production):
--   1. Supabase scheduled SQL via pg_cron — fire on the 1st of each month
--      at 09:00 UTC for the prior month:
--      select cron.schedule(
--        'generate_monthly_invoices', '0 9 1 * *',
--        $$ select public.generate_monthly_invoices_for_period(
--             (date_trunc('month', now()) - interval '1 month')::date,
--             (date_trunc('month', now()) - interval '1 day')::date
--           ); $$
--      );
--   2. External cron (Vercel Cron, GitHub Actions) calls a thin server route
--      that invokes this function via the admin client.
--   3. Manual: Arbor admin can also trigger via the existing
--      generateInvoiceNowAction server action (which targets a single agency).
--
-- The function is SECURITY DEFINER so it can write to arbor_invoices regardless
-- of the calling role.
-- =============================================================================

create or replace function public.generate_monthly_invoices_for_period(
  p_period_start date,
  p_period_end   date
)
  returns table (
    agency_id      uuid,
    invoice_id     uuid,
    invoice_number text,
    total_cents    bigint,
    line_count     integer,
    skipped        boolean,
    skip_reason    text
  )
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_agency       record;
  v_existing     uuid;
  v_invoice_no   text;
  v_invoice_id   uuid;
  v_due_at       date;
  v_terms        integer;
  v_line_items   jsonb;
  v_total        bigint;
  v_lines        record;
  v_line_count   integer;
begin
  -- Iterate every agency that has at least one active contract overlapping the period.
  for v_agency in
    select a.id
    from public.agencies a
    where exists (
      select 1
      from public.client_contracts c
      where c.agency_id = a.id
        and c.status = 'active'
        and c.contract_start <= p_period_end
        and (c.contract_end is null or c.contract_end >= p_period_start)
    )
  loop
    -- Idempotency: skip if an invoice already exists for this period.
    select id into v_existing
      from public.arbor_invoices
      where agency_id = v_agency.id
        and period_start = p_period_start
        and period_end = p_period_end
      limit 1;

    if v_existing is not null then
      agency_id := v_agency.id;
      invoice_id := v_existing;
      invoice_number := null;
      total_cents := null;
      line_count := null;
      skipped := true;
      skip_reason := 'already_exists';
      return next;
      continue;
    end if;

    -- Build line items + total via the helper.
    select
      jsonb_agg(jsonb_build_object(
        'contract_id', cs.contract_id,
        'org_id', cs.org_id,
        'org_name', cs.org_name,
        'pricing_tier', cs.pricing_tier,
        'annual_value_cents', cs.annual_value_cents,
        'effective_share_pct', cs.effective_share_pct,
        'period_share_cents', cs.period_share_cents
      )),
      coalesce(sum(cs.period_share_cents), 0),
      count(*)
    into v_line_items, v_total, v_line_count
    from public.calculate_period_rev_share(v_agency.id, p_period_start, p_period_end) cs;

    if v_line_count = 0 or v_total = 0 then
      agency_id := v_agency.id;
      invoice_id := null;
      invoice_number := null;
      total_cents := 0;
      line_count := 0;
      skipped := true;
      skip_reason := 'zero_owed';
      return next;
      continue;
    end if;

    -- Compute due_at = period_end + agency.payment_terms_days
    select payment_terms_days into v_terms
      from public.agencies where id = v_agency.id;
    v_due_at := p_period_end + (v_terms || ' days')::interval;

    -- Get next invoice number + insert.
    v_invoice_no := public.next_invoice_number();

    insert into public.arbor_invoices
      (invoice_number, agency_id, period_start, period_end,
       due_at, total_cents, status, payment_provider, line_items)
    values
      (v_invoice_no, v_agency.id, p_period_start, p_period_end,
       v_due_at, v_total, 'draft', 'manual', coalesce(v_line_items, '[]'::jsonb))
    returning id into v_invoice_id;

    -- Audit (link to first contract's org_id since audit_log requires non-null)
    for v_lines in
      select cs.org_id from public.calculate_period_rev_share(v_agency.id, p_period_start, p_period_end) cs limit 1
    loop
      insert into public.audit_log
        (org_id, actor_id, operation, table_name, record_id,
         changed_fields, old_values, new_values)
      values
        (v_lines.org_id, null, 'ARBOR_INVOICE_GENERATED_BATCH',
         'arbor_invoices', v_invoice_id,
         null, null,
         jsonb_build_object(
           'invoice_number', v_invoice_no,
           'agency_id', v_agency.id,
           'period_start', p_period_start,
           'period_end', p_period_end,
           'total_cents', v_total,
           'line_count', v_line_count
         ));
    end loop;

    agency_id := v_agency.id;
    invoice_id := v_invoice_id;
    invoice_number := v_invoice_no;
    total_cents := v_total;
    line_count := v_line_count;
    skipped := false;
    skip_reason := null;
    return next;
  end loop;

  return;
end;
$$;

comment on function public.generate_monthly_invoices_for_period(date, date) is
  'Generates a draft arbor_invoice for every agency with active contracts overlapping the period. Idempotent on (agency_id, period_start, period_end). Returns one row per agency with status flags. Wire to pg_cron or external cron to run monthly.';
