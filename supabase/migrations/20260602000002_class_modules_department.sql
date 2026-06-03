-- ── class_modules → department-scoped ───────────────────────────────────────
-- Modules belong to a department (like classes). Backfill existing modules to
-- their org's General (or oldest) department, then enforce NOT NULL. Uniqueness
-- of name moves from per-org to per-department.

alter table public.class_modules
  add column department_id uuid references public.departments(id) on delete cascade;

update public.class_modules cm
set department_id = coalesce(
  (select d.id from public.departments d
     where d.org_id = cm.org_id and d.slug = 'general' limit 1),
  (select d.id from public.departments d
     where d.org_id = cm.org_id order by d.created_at limit 1)
)
where department_id is null;

alter table public.class_modules alter column department_id set not null;

create index on public.class_modules (department_id);

drop index if exists public.class_modules_org_name_unique;
create unique index class_modules_dept_name_unique
  on public.class_modules (department_id, lower(name))
  where deleted_at is null;
