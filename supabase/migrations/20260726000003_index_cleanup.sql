-- =============================================================================
-- Index cleanup flagged by the Supabase performance advisor.
-- =============================================================================

-- public_intake_links has two identical UNIQUE indexes on (token). Keep
-- public_intake_links_token_key: it backs the UNIQUE constraint AND is the
-- index education_requests_public_form_token_fkey references, so it can't be
-- dropped. public_intake_links_token_idx is a standalone duplicate that only
-- costs write throughput.
drop index if exists public.public_intake_links_token_idx;

-- Foreign keys without a covering index. These tables arrived in
-- 20260627000001_consultant_onboarding, after the FK-indexing sweep in
-- 20260604000002, so they were missed. Unindexed FKs make the referenced
-- side's deletes and updates scan.
create index if not exists ix_onboarding_progress_created_by
  on public.onboarding_progress (created_by);
create index if not exists ix_onboarding_progress_task_id
  on public.onboarding_progress (task_id);
create index if not exists ix_onboarding_progress_updated_by
  on public.onboarding_progress (updated_by);
create index if not exists ix_onboarding_tasks_created_by
  on public.onboarding_tasks (created_by);
create index if not exists ix_onboarding_tasks_updated_by
  on public.onboarding_tasks (updated_by);
