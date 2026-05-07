-- Make write_audit_log() tolerant of tables that lack an `id` column
-- (composite-PK junction tables like allocation_group_members and
-- recurring_task_assignments). Without this, INSERT/UPDATE/DELETE on those
-- tables fails with "null value in column record_id violates not-null
-- constraint" because the prior implementation always inserted an audit row.
--
-- Behavior change: if the affected table has no `id` column, the trigger
-- silently skips writing to audit_log. State changes on those junction tables
-- can still be inferred from the parent record's audit history (the parent's
-- updated_at is touched explicitly by the actions that mutate the junction).

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

  -- Skip tables without an `id` column (composite-PK junctions). The DML
  -- still proceeds; only the audit-row insert is suppressed.
  if v_record_id is null then
    return coalesce(new, old);
  end if;

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
