-- ── Scalar helpers ───────────────────────────────────────────────────────────

create or replace function public.current_user_id()
  returns uuid
  language sql stable security definer
  set search_path = ''
as $$
  select auth.uid()
$$;

-- Returns every org_id the current JWT user has an accepted membership in.
-- Uses plpgsql so the reference to org_memberships isn't validated until runtime
-- (the table is created in the next migration).
create or replace function public.user_org_ids()
  returns setof uuid
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  return query
    select org_id
    from public.org_memberships
    where user_id = auth.uid()
      and accepted_at is not null;
end;
$$;

-- True when the current user holds org_admin role in p_org_id with an accepted membership.
create or replace function public.is_org_admin(p_org_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.org_memberships
    where org_id       = p_org_id
      and user_id      = auth.uid()
      and role         = 'org_admin'
      and accepted_at  is not null
  );
end;
$$;

-- ── Standard trigger functions ────────────────────────────────────────────────

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_actor_audit_fields()
  returns trigger
  language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
  end if;
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.bump_version()
  returns trigger
  language plpgsql
as $$
begin
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

-- Appends one row to public.audit_log for every DML operation.
-- Captures changed_fields for UPDATE; old_values/new_values for UPDATE/DELETE/INSERT.
-- org_id falls back to id for the organizations table itself (which has no org_id column).
create or replace function public.write_audit_log()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_row          jsonb;
  v_old          jsonb;
  v_org_id       uuid;
  v_record_id    uuid;
  v_changed      text[];
begin
  case tg_op
    when 'DELETE' then
      v_old = to_jsonb(old);
      v_row = null;
    when 'UPDATE' then
      v_old = to_jsonb(old);
      v_row = to_jsonb(new);
      select array_agg(key)
        into v_changed
        from jsonb_each(v_row)
        where value is distinct from (v_old -> key);
    else
      v_old = null;
      v_row = to_jsonb(new);
  end case;

  v_record_id = ((coalesce(v_row, v_old)) ->> 'id')::uuid;
  v_org_id = coalesce(
    ((coalesce(v_row, v_old)) ->> 'org_id')::uuid,
    v_record_id
  );

  insert into public.audit_log
    (org_id, actor_id, operation, table_name, record_id, changed_fields, old_values, new_values)
  values
    (v_org_id, auth.uid(), tg_op, tg_table_name, v_record_id, v_changed, v_old, v_row);

  return coalesce(new, old);
end;
$$;

-- ── Trigger wiring helper ─────────────────────────────────────────────────────

-- Attaches set_updated_at (BEFORE UPDATE) and write_audit_log (AFTER DML) to p_table_name.
create or replace function public.apply_standard_triggers(p_table_name text)
  returns void
  language plpgsql
as $$
begin
  execute format(
    $sql$
      create trigger set_updated_at
        before update on public.%I
        for each row execute function public.set_updated_at()
    $sql$,
    p_table_name
  );

  execute format(
    $sql$
      create trigger write_audit_log
        after insert or update or delete on public.%I
        for each row execute function public.write_audit_log()
    $sql$,
    p_table_name
  );
end;
$$;
