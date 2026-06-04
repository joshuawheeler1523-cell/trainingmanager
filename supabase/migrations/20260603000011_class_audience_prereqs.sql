-- =============================================================================
-- Course catalog: target audience + prerequisites (free-text descriptors)
-- =============================================================================
-- Catalog-facing descriptors distinct from the structured skill/cert
-- requirements (class_skill_requirements). Free text so a manager can write
-- "New graduate nurses" / "Current BLS certification" without modeling.
-- =============================================================================

alter table public.classes
  add column if not exists target_audience text,
  add column if not exists prerequisites text;

-- classes_with_hours selects c.* — Postgres froze that column list at view
-- creation, so the new columns won't appear until the view is rebuilt.
drop view if exists public.classes_with_hours;

create view public.classes_with_hours as
select
  c.*,
  case
    when c.is_multi_day and c.custom_day_hours is not null
      then (select sum(h) from unnest(c.custom_day_hours) h)
    else coalesce(c.hours_per_day, 0) * c.total_days
  end as instruction_hours_per_offering,
  (
    case
      when c.is_multi_day and c.custom_day_hours is not null
        then (select sum(h) from unnest(c.custom_day_hours) h)
      else coalesce(c.hours_per_day, 0) * c.total_days
    end
    + c.prep_hours_per_offering
    + c.logistics_hours_per_offering
  ) as total_hours_per_offering,
  (
    (
      case
        when c.is_multi_day and c.custom_day_hours is not null
          then (select sum(h) from unnest(c.custom_day_hours) h)
        else coalesce(c.hours_per_day, 0) * c.total_days
      end
      + c.prep_hours_per_offering
      + c.logistics_hours_per_offering
    ) * c.offerings_per_year
  ) as annual_class_hours
from public.classes c
where c.deleted_at is null;

alter view public.classes_with_hours set (security_invoker = true);
