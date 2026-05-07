-- Demo seed — applied by `supabase db reset` after migrations.
-- User creation is handled by the TypeScript seed script (pnpm db:seed).

insert into public.organizations (id, name, slug)
values (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'Mercy Health (Demo)',
  'mercy-health-demo'
)
on conflict (slug) do nothing;

-- 5 demo instructors (table added in Phase 1)
-- insert into public.instructors ...
