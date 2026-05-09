-- =============================================================================
-- Phase 2.5 (Workspace identity) — preset key + label overrides + module flags
-- =============================================================================
-- Adds the workspace identity layer that lets each org pick a preset
-- (hospital_training, corporate_ld, emr_analyst, clinical_informatics,
-- software_engineering, consulting, creative_agency, or custom) and override
-- display labels for roles + entities without changing internal identifiers.
--
-- Module toggles use the existing feature_flags table with the canonical key
-- namespace `module.<name>` (module.classes, module.training_planner,
-- module.education_requests). All other modules are always-on.
--
-- Behavior change for existing data: NONE. Every existing org is seeded with
-- preset_key='hospital_training' + every toggleable module enabled. The
-- terminology layer reads defaults when role_labels/entity_labels are empty.
-- An existing hospital training user sees the exact same UI today.
--
-- DOWN (rollback):
--   delete from public.feature_flags where key like 'module.%';
--   alter table public.organizations
--     drop column entity_labels,
--     drop column role_labels,
--     drop column preset_key;
--   drop type if exists public.workspace_preset_key;
-- =============================================================================

-- ── 1. Preset enum ──────────────────────────────────────────────────────────

create type public.workspace_preset_key as enum (
  'hospital_training',
  'corporate_ld',
  'emr_analyst',
  'clinical_informatics',
  'software_engineering',
  'consulting',
  'creative_agency',
  'custom'
);

-- ── 2. Workspace identity columns on organizations ─────────────────────────

alter table public.organizations
  add column preset_key   public.workspace_preset_key not null default 'hospital_training',
  add column role_labels   jsonb                       not null default '{}'::jsonb,
  add column entity_labels jsonb                       not null default '{}'::jsonb;

comment on column public.organizations.preset_key is
  'Workspace preset bundling module toggles + default labels + bucket templates. See packages/shared/src/presets.';
comment on column public.organizations.role_labels is
  'Per-org overrides for role display labels. Shape: {"manager":{"singular":"Trainer","plural":"Trainers"}}. Empty {} → use defaults.';
comment on column public.organizations.entity_labels is
  'Per-org overrides for entity display labels (e.g. instructors → trainers). Same shape as role_labels.';

-- ── 3. Seed: existing orgs get hospital_training (their current behavior) ──
-- preset_key already defaulted to hospital_training above; this is for clarity.

update public.organizations
  set preset_key = 'hospital_training'
  where preset_key is null;

-- ── 4. Module feature flags — all on for hospital_training ──────────────────
-- Every existing org gets all toggleable modules ON. This preserves today's
-- behavior exactly. Nav reads these flags to decide what to render.

insert into public.feature_flags (org_id, key, enabled)
select id, 'module.classes', true from public.organizations
on conflict (org_id, key) do update set enabled = excluded.enabled;

insert into public.feature_flags (org_id, key, enabled)
select id, 'module.training_planner', true from public.organizations
on conflict (org_id, key) do update set enabled = excluded.enabled;

insert into public.feature_flags (org_id, key, enabled)
select id, 'module.education_requests', true from public.organizations
on conflict (org_id, key) do update set enabled = excluded.enabled;

-- ── 5. apply_workspace_preset RPC ──────────────────────────────────────────
-- Called from the workspace settings UI (manager-only). Sets the preset key
-- and reseeds the module flags per the preset's manifest (passed as JSON from
-- the app since the preset library lives in TypeScript).
--
-- The caller is responsible for passing the correct module + label payload
-- for the chosen preset. Centralizing the preset definitions in TypeScript
-- (single source of truth for both UI rendering and DB updates) avoids
-- duplicating them in SQL where they'd drift.
--
-- p_overwrite_labels = false → keep existing role_labels + entity_labels
--                              even if the new preset has different defaults.
-- p_overwrite_labels = true  → replace label overrides with preset defaults.

create or replace function public.apply_workspace_preset(
  p_org_id            uuid,
  p_preset_key        public.workspace_preset_key,
  p_module_flags      jsonb,                            -- {"module.classes": true, ...}
  p_role_labels       jsonb default '{}'::jsonb,
  p_entity_labels     jsonb default '{}'::jsonb,
  p_overwrite_labels  boolean default false
)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_key  text;
  v_val  boolean;
begin
  -- Manager-only — defense in depth on top of the app-level check.
  if not public.is_manager(p_org_id) then
    raise exception 'apply_workspace_preset: caller is not a manager in org %', p_org_id
      using errcode = '42501';
  end if;

  -- Update preset key + (conditionally) labels.
  if p_overwrite_labels then
    update public.organizations
      set preset_key    = p_preset_key,
          role_labels   = p_role_labels,
          entity_labels = p_entity_labels
      where id = p_org_id;
  else
    update public.organizations
      set preset_key = p_preset_key
      where id = p_org_id;
  end if;

  -- Upsert each module flag from the supplied JSON.
  for v_key, v_val in
    select * from jsonb_each_text(p_module_flags)
  loop
    insert into public.feature_flags (org_id, key, enabled)
      values (p_org_id, v_key, v_val::boolean)
      on conflict (org_id, key) do update set enabled = excluded.enabled;
  end loop;

  -- Audit entry — manual since organizations doesn't have apply_standard_triggers.
  insert into public.audit_log
    (org_id, actor_id, operation, table_name, record_id, changed_fields, old_values, new_values)
    values (
      p_org_id,
      auth.uid(),
      'WORKSPACE_PRESET_APPLIED',
      'organizations',
      p_org_id,
      array['preset_key'],
      null,
      jsonb_build_object(
        'preset_key',         p_preset_key,
        'module_flags',       p_module_flags,
        'overwrote_labels',   p_overwrite_labels
      )
    );
end;
$$;

comment on function public.apply_workspace_preset(uuid, public.workspace_preset_key, jsonb, jsonb, jsonb, boolean) is
  'Applies a workspace preset to an org. Updates organizations.preset_key, optionally label overrides, and upserts module feature_flags. Manager-only. Writes WORKSPACE_PRESET_APPLIED audit_log entry.';
