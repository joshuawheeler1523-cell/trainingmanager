# Arbor — Data Model & Database Schema

**Status:** Authoritative reference. The build prompts in document 03 assume this exactly.
**Database:** PostgreSQL 15+ via Supabase
**Conventions:** snake_case identifiers, plural table names, `id uuid` primary keys, `created_at`/`updated_at` timestamps everywhere, soft deletes via `deleted_at` where noted.

---

## 1. Conventions applied across all tables

Every table in this schema follows these rules unless explicitly noted:

- **Primary key:** `id uuid not null default gen_random_uuid() primary key`
- **Tenant scope:** `org_id uuid not null references organizations(id) on delete cascade` (except `organizations`, `auth.users`, and global catalogs)
- **Timestamps:** `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- **Soft delete (where noted):** `deleted_at timestamptz null` — queries filter `where deleted_at is null` by default
- **Updater tracking:** `created_by uuid references auth.users(id)`, `updated_by uuid references auth.users(id)`
- **Optimistic concurrency:** `version integer not null default 1` on entities edited by multiple users (allocations, projects, tasks)
- **RLS:** Enabled on every table. Policies enforce `org_id = current_org_id()` for SELECT/INSERT/UPDATE/DELETE.
- **Indexes:** Always on foreign keys, on `org_id`, on common filter columns
- **Audit:** Every INSERT/UPDATE/DELETE on a tenant table fires a trigger that writes to `audit_log`

A standard set of triggers handles the boring stuff:

- `set_updated_at()` — bumps `updated_at` on UPDATE
- `set_actor_audit_fields()` — fills `created_by`/`updated_by` from `auth.uid()`
- `bump_version()` — increments `version` on UPDATE
- `write_audit_log()` — writes change diff to `audit_log`

These are applied via a generic `apply_standard_triggers(table_name)` helper run from each migration.

---

## 2. Identity, tenancy, and access control

### 2.1 `organizations`

The tenant root. A hospital, health system, or pilot org.

| Column                 | Type                                     | Notes                                 |
| ---------------------- | ---------------------------------------- | ------------------------------------- |
| id                     | uuid PK                                  |                                       |
| name                   | text not null                            |                                       |
| slug                   | text not null unique                     | URL segment, e.g. `mercy-health`      |
| time_zone              | text not null default 'America/New_York' | IANA TZ                               |
| settings               | jsonb not null default '{}'              | feature flags, defaults               |
| billing_tier           | text                                     | `tier_1` … `tier_4` per pricing model |
| onboarded_at           | timestamptz                              | null until go-live                    |
| logo_url               | text                                     | optional                              |
| created_at, updated_at | timestamptz                              |                                       |

### 2.2 `org_memberships`

Links a Supabase `auth.users.id` to an `organizations.id` with a role and visibility scope. A user can belong to multiple orgs.

| Column                 | Type                         | Notes                       |
| ---------------------- | ---------------------------- | --------------------------- |
| id                     | uuid PK                      |                             |
| org_id                 | uuid FK → organizations      |                             |
| user_id                | uuid FK → auth.users         |                             |
| role                   | text not null                | enum: `member`, `org_admin` |
| visibility             | text not null default 'full' | enum: `full`, `limited`     |
| display_name           | text                         | per-org override            |
| invited_at             | timestamptz                  |                             |
| accepted_at            | timestamptz                  | null until accepted         |
| created_at, updated_at | timestamptz                  |                             |
| UNIQUE                 | (org_id, user_id)            |                             |

`visibility = 'limited'` restricts the user to records they're directly assigned to (their own instructor profile, classes/projects/requests they're on).

### 2.3 `org_invitations`

Pending invites before account creation.

| Column      | Type                         | Notes                  |
| ----------- | ---------------------------- | ---------------------- |
| id          | uuid PK                      |                        |
| org_id      | uuid FK                      |                        |
| email       | citext not null              |                        |
| role        | text not null                |                        |
| visibility  | text not null default 'full' |                        |
| token       | text not null unique         | one-time use           |
| expires_at  | timestamptz not null         | default now() + 7 days |
| accepted_at | timestamptz                  |                        |
| created_by  | uuid FK → auth.users         |                        |
| created_at  | timestamptz                  |                        |

### 2.4 RLS helper functions

```sql
create or replace function public.current_user_id() returns uuid
  language sql stable as $$ select auth.uid() $$;

create or replace function public.user_org_ids() returns setof uuid
  language sql stable as $$
    select org_id from org_memberships
    where user_id = auth.uid() and accepted_at is not null
  $$;

create or replace function public.is_org_admin(p_org_id uuid) returns boolean
  language sql stable as $$
    select exists (
      select 1 from org_memberships
      where user_id = auth.uid() and org_id = p_org_id
        and role = 'org_admin' and accepted_at is not null
    )
  $$;
```

Standard RLS policy template applied to every tenant table:

```sql
alter table <table_name> enable row level security;

create policy "<table>_select" on <table_name>
  for select using (org_id in (select user_org_ids()));

create policy "<table>_modify" on <table_name>
  for all using (org_id in (select user_org_ids()))
  with check (org_id in (select user_org_ids()));
```

Org admins get extra latitude on a few sensitive tables (memberships, invitations, settings) via a separate policy keyed off `is_org_admin(org_id)`.

---

## 3. Audit & feature flags

### 3.1 `audit_log`

Every change to every tenant table.

| Column         | Type                               | Notes                              |
| -------------- | ---------------------------------- | ---------------------------------- |
| id             | bigint PK identity                 |                                    |
| org_id         | uuid not null                      |                                    |
| actor_id       | uuid                               | nullable for system actions        |
| table_name     | text not null                      |                                    |
| record_id      | uuid not null                      |                                    |
| operation      | text not null                      | enum: `INSERT`, `UPDATE`, `DELETE` |
| changed_fields | text[]                             | UPDATE only                        |
| old_values     | jsonb                              | UPDATE/DELETE                      |
| new_values     | jsonb                              | INSERT/UPDATE                      |
| occurred_at    | timestamptz not null default now() |                                    |

Indexes: `(org_id, occurred_at desc)`, `(org_id, table_name, record_id)`, `(actor_id, occurred_at desc)`.

### 3.2 `feature_flags`

Org-scoped feature toggles.

| Column  | Type                           | Notes                      |
| ------- | ------------------------------ | -------------------------- |
| id      | uuid PK                        |                            |
| org_id  | uuid FK                        | nullable for global flags  |
| key     | text not null                  | e.g., `ai_estimation`      |
| enabled | boolean not null default false |                            |
| value   | jsonb                          | optional structured config |
| UNIQUE  | (org_id, key)                  |                            |

---

## 4. Instructors & people

### 4.1 `instructors`

| Column                                                  | Type                           | Notes                                   |
| ------------------------------------------------------- | ------------------------------ | --------------------------------------- |
| id                                                      | uuid PK                        |                                         |
| org_id                                                  | uuid FK                        |                                         |
| user_id                                                 | uuid FK → auth.users           | nullable; instructor may not have login |
| full_name                                               | text not null                  |                                         |
| email                                                   | citext                         | unique within org when present          |
| phone                                                   | text                           |                                         |
| department                                              | text                           |                                         |
| location                                                | text                           |                                         |
| job_title                                               | text                           |                                         |
| start_date                                              | date                           |                                         |
| annual_hours                                            | integer not null default 1880  | base capacity                           |
| status                                                  | text not null default 'active' | enum: `active`, `inactive`, `on_leave`  |
| notes                                                   | text                           |                                         |
| deleted_at                                              | timestamptz                    | soft delete                             |
| created_at, updated_at, created_by, updated_by, version |                                |                                         |

Indexes: `(org_id, status)`, `(org_id, full_name)`, `(org_id, deleted_at)`.

### 4.2 Instructor groups (for grouped allocations)

`allocation_groups` and `allocation_group_members` — see Section 7.

---

## 5. Skills & certifications

### 5.1 `skills`

Per-org skill library.

| Column               | Type                           | Notes                                 |
| -------------------- | ------------------------------ | ------------------------------------- |
| id                   | uuid PK                        |                                       |
| org_id               | uuid FK                        |                                       |
| name                 | text not null                  |                                       |
| category             | text                           | e.g., `clinical`, `technical`, `soft` |
| description          | text                           |                                       |
| is_certification     | boolean not null default false |                                       |
| certifying_authority | text                           |                                       |
| UNIQUE               | (org_id, name)                 |                                       |

### 5.2 `instructor_skills`

Junction with proficiency and certification details.

| Column          | Type                           | Notes                                                  |
| --------------- | ------------------------------ | ------------------------------------------------------ |
| id              | uuid PK                        |                                                        |
| org_id          | uuid FK                        |                                                        |
| instructor_id   | uuid FK                        |                                                        |
| skill_id        | uuid FK                        |                                                        |
| proficiency     | text not null                  | enum: `beginner`, `intermediate`, `advanced`, `expert` |
| is_certified    | boolean not null default false |                                                        |
| certified_at    | date                           |                                                        |
| expires_at      | date                           |                                                        |
| certificate_url | text                           |                                                        |
| notes           | text                           |                                                        |
| UNIQUE          | (instructor_id, skill_id)      |                                                        |

Index on `(org_id, expires_at)` for the expiry alert job.

### 5.3 `class_skill_requirements`

| Column          | Type                             | Notes                          |
| --------------- | -------------------------------- | ------------------------------ |
| id              | uuid PK                          |                                |
| org_id          | uuid FK                          |                                |
| class_id        | uuid FK                          |                                |
| skill_id        | uuid FK                          |                                |
| min_proficiency | text not null                    | same enum as instructor_skills |
| requirement     | text not null default 'required' | enum: `required`, `preferred`  |
| UNIQUE          | (class_id, skill_id)             |                                |

---

## 6. Classes (the catalog of courses delivered)

### 6.1 `classes`

| Column                                                  | Type                            | Notes                                 |
| ------------------------------------------------------- | ------------------------------- | ------------------------------------- |
| id                                                      | uuid PK                         |                                       |
| org_id                                                  | uuid FK                         |                                       |
| name                                                    | text not null                   |                                       |
| description                                             | text                            |                                       |
| allocation_bucket_id                                    | uuid FK → allocation_buckets    | nullable                              |
| is_multi_day                                            | boolean not null default false  |                                       |
| total_days                                              | integer not null default 1      |                                       |
| hours_per_day                                           | numeric(5,2)                    | for single-day or uniform multi-day   |
| custom_day_hours                                        | numeric(5,2)[]                  | length must equal total_days when set |
| offerings_per_year                                      | integer not null default 0      |                                       |
| prep_hours_per_offering                                 | numeric(5,2) not null default 0 |                                       |
| logistics_hours_per_offering                            | numeric(5,2) not null default 0 |                                       |
| status                                                  | text not null default 'active'  | enum: `active`, `archived`            |
| deleted_at                                              | timestamptz                     |                                       |
| created_at, updated_at, created_by, updated_by, version |                                 |                                       |

Computed in views (do not store): `instruction_hours_per_offering`, `total_hours_per_offering`, `annual_class_hours`.

```sql
-- in public.classes_with_hours view:
case when is_multi_day and custom_day_hours is not null
  then (select sum(h) from unnest(custom_day_hours) h)
  else coalesce(hours_per_day, 0) * total_days
end as instruction_hours_per_offering
```

### 6.2 `class_instructor_assignments`

Which instructors are eligible/assigned to teach a class.

| Column             | Type                             | Notes                                                   |
| ------------------ | -------------------------------- | ------------------------------------------------------- |
| id                 | uuid PK                          |                                                         |
| org_id             | uuid FK                          |                                                         |
| class_id           | uuid FK                          |                                                         |
| instructor_id      | uuid FK                          |                                                         |
| role               | text not null default 'eligible' | enum: `eligible`, `primary`, `backup`                   |
| assigned_offerings | integer not null default 0       | how many of the year's offerings this instructor covers |
| UNIQUE             | (class_id, instructor_id)        |                                                         |

Validation rule (enforced by trigger): `sum(assigned_offerings) over (class_id) <= classes.offerings_per_year`.

---

## 7. Allocation system (the heart of capacity)

The allocation system has six visible tabs in the UI; here's how they map to tables.

### 7.1 `allocation_buckets`

User-defined work categories (Instruction, Development, Administrative, etc.).

| Column        | Type                                     | Notes |
| ------------- | ---------------------------------------- | ----- |
| id            | uuid PK                                  |       |
| org_id        | uuid FK                                  |       |
| name          | text not null                            |       |
| description   | text                                     |       |
| color         | text not null default '#6366f1'          | hex   |
| display_order | integer not null default 0               |       |
| is_archived   | boolean not null default false           |       |
| UNIQUE        | (org_id, name) where is_archived = false |       |

### 7.2 `global_allocations`

The org-wide default percentage per bucket. Should sum to 100 (enforced by app + a trigger that warns).

| Column         | Type                                                                        | Notes |
| -------------- | --------------------------------------------------------------------------- | ----- |
| id             | uuid PK                                                                     |       |
| org_id         | uuid FK                                                                     |       |
| bucket_id      | uuid FK                                                                     |       |
| target_percent | numeric(5,2) not null check (target_percent >= 0 and target_percent <= 100) |       |
| UNIQUE         | (org_id, bucket_id)                                                         |       |

### 7.3 `allocation_groups`

Groups of instructors (e.g., "Clinical Instructors", "Senior Developers").

| Column      | Type           | Notes |
| ----------- | -------------- | ----- |
| id          | uuid PK        |       |
| org_id      | uuid FK        |       |
| name        | text not null  |       |
| description | text           |       |
| UNIQUE      | (org_id, name) |       |

### 7.4 `allocation_group_members`

| Column        | Type       | Notes |
| ------------- | ---------- | ----- |
| group_id      | uuid FK PK |       |
| instructor_id | uuid FK PK |       |
| org_id        | uuid FK    |       |

### 7.5 `group_allocations`

Per-group bucket percentages (override global for members of that group).

| Column         | Type                  | Notes |
| -------------- | --------------------- | ----- |
| id             | uuid PK               |       |
| org_id         | uuid FK               |       |
| group_id       | uuid FK               |       |
| bucket_id      | uuid FK               |       |
| target_percent | numeric(5,2) not null |       |
| UNIQUE         | (group_id, bucket_id) |       |

### 7.6 `individual_allocations`

Per-instructor overrides (highest precedence).

| Column         | Type                       | Notes |
| -------------- | -------------------------- | ----- |
| id             | uuid PK                    |       |
| org_id         | uuid FK                    |       |
| instructor_id  | uuid FK                    |       |
| bucket_id      | uuid FK                    |       |
| target_percent | numeric(5,2) not null      |       |
| UNIQUE         | (instructor_id, bucket_id) |       |

### 7.7 Resolution logic (function)

```sql
create or replace function public.effective_allocation(p_instructor_id uuid)
returns table(bucket_id uuid, target_percent numeric, source text) ...
```

Resolution order: individual > group > global. If an instructor belongs to multiple groups, the group with the _latest_ `updated_at` wins (documented behavior).

### 7.8 `recurring_tasks`

Tasks that repeat on a schedule and consume hours.

| Column               | Type                           | Notes                                                                   |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| id                   | uuid PK                        |                                                                         |
| org_id               | uuid FK                        |                                                                         |
| name                 | text not null                  |                                                                         |
| description          | text                           |                                                                         |
| bucket_id            | uuid FK                        |                                                                         |
| hours_per_occurrence | numeric(5,2) not null          |                                                                         |
| frequency            | text not null                  | enum: `daily`, `weekly`, `biweekly`, `monthly`, `quarterly`, `annually` |
| occurrences_per_year | integer                        | nullable; computed default if null based on frequency                   |
| status               | text not null default 'active' | enum: `active`, `paused`, `archived`                                    |
| deleted_at           | timestamptz                    |                                                                         |

`recurring_task_assignments` junction table:

| Column            | Type                                 | Notes                                     |
| ----------------- | ------------------------------------ | ----------------------------------------- |
| recurring_task_id | uuid FK PK                           |                                           |
| instructor_id     | uuid FK PK                           |                                           |
| org_id            | uuid FK                              |                                           |
| share_percent     | numeric(5,2) not null default 100.00 | how this instructor's slice is calculated |

### 7.9 `ad_hoc_tasks`

One-time tasks.

| Column        | Type                         | Notes                                            |
| ------------- | ---------------------------- | ------------------------------------------------ |
| id            | uuid PK                      |                                                  |
| org_id        | uuid FK                      |                                                  |
| name          | text not null                |                                                  |
| description   | text                         |                                                  |
| bucket_id     | uuid FK                      |                                                  |
| instructor_id | uuid FK                      | nullable until assigned                          |
| hours         | numeric(5,2) not null        |                                                  |
| due_date      | date                         |                                                  |
| status        | text not null default 'open' | enum: `open`, `in_progress`, `done`, `cancelled` |
| completed_at  | timestamptz                  |                                                  |

---

## 8. Education request queue & TRAs

### 8.1 `education_requests`

| Column                  | Type                             | Notes                                                                                                   |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| id                      | uuid PK                          |                                                                                                         |
| org_id                  | uuid FK                          |                                                                                                         |
| title                   | text not null                    |                                                                                                         |
| requested_by_name       | text not null                    | external requester name                                                                                 |
| requested_by_email      | citext                           |                                                                                                         |
| requested_by_department | text                             |                                                                                                         |
| business_justification  | text                             |                                                                                                         |
| target_audience         | text                             |                                                                                                         |
| urgency                 | text not null default 'standard' | enum: `low`, `standard`, `high`, `urgent`                                                               |
| target_completion_date  | date                             |                                                                                                         |
| status                  | text not null default 'new'      | enum: `new`, `under_review`, `approved`, `assigned`, `in_progress`, `completed`, `archived`, `rejected` |
| review_notes            | text                             |                                                                                                         |
| linked_tra_id           | uuid FK → tras                   | nullable                                                                                                |
| linked_project_id       | uuid FK → projects               | nullable                                                                                                |
| submitted_via           | text not null default 'app'      | enum: `app`, `public_form`                                                                              |
| public_form_token       | uuid                             | nullable, populated for `public_form` submissions                                                       |
| deleted_at              | timestamptz                      |                                                                                                         |

Indexes: `(org_id, status, created_at desc)`, `(org_id, urgency)`.

### 8.2 `education_request_assignments`

| Column          | Type                  | Notes                   |
| --------------- | --------------------- | ----------------------- |
| id              | uuid PK               |                         |
| org_id          | uuid FK               |                         |
| request_id      | uuid FK               |                         |
| instructor_id   | uuid FK               |                         |
| estimated_hours | numeric(7,2) not null |                         |
| actual_hours    | numeric(7,2)          | populated on completion |
| started_at      | timestamptz           |                         |
| completed_at    | timestamptz           |                         |

### 8.3 `education_request_history`

Audit trail specific to requests (status changes, reviewer comments).

| Column      | Type                      | Notes |
| ----------- | ------------------------- | ----- |
| id          | bigint PK                 |       |
| org_id      | uuid FK                   |       |
| request_id  | uuid FK                   |       |
| from_status | text                      |       |
| to_status   | text not null             |       |
| comment     | text                      |       |
| actor_id    | uuid FK → auth.users      |       |
| occurred_at | timestamptz default now() |       |

### 8.4 `public_intake_links`

Tokenized intake forms exposed externally. No login.

| Column     | Type                                           | Notes                   |
| ---------- | ---------------------------------------------- | ----------------------- |
| id         | uuid PK                                        |                         |
| org_id     | uuid FK                                        |                         |
| token      | uuid not null unique default gen_random_uuid() |                         |
| label      | text                                           | "All-staff intake form" |
| is_active  | boolean not null default true                  |                         |
| expires_at | timestamptz                                    |                         |
| created_by | uuid FK → auth.users                           |                         |
| created_at | timestamptz                                    |                         |

A public-anon Supabase policy permits insert into `education_requests` only when accompanied by a valid `public_form_token` matching an active link.

### 8.5 `tras` (Training Request Assessments)

| Column                                         | Type                             | Notes                                                           |
| ---------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| id                                             | uuid PK                          |                                                                 |
| org_id                                         | uuid FK                          |                                                                 |
| project_name                                   | text not null                    |                                                                 |
| description                                    | text                             |                                                                 |
| requesting_department                          | text                             |                                                                 |
| stakeholder_name                               | text                             |                                                                 |
| stakeholder_email                              | citext                           |                                                                 |
| business_justification                         | text                             |                                                                 |
| target_audience                                | text                             |                                                                 |
| urgency                                        | text not null default 'standard' |                                                                 |
| status                                         | text not null default 'draft'    | enum: `draft`, `submitted`, `approved`, `converted`, `rejected` |
| total_estimated_hours                          | numeric(9,2)                     | computed snapshot                                               |
| converted_to_project_id                        | uuid FK → projects               |                                                                 |
| ai_assistant_used                              | boolean not null default false   |                                                                 |
| created_at, updated_at, created_by, updated_by |                                  |                                                                 |

### 8.6 `deliverable_types`

Catalog of deliverable categories with default effort ratios.

| Column            | Type                                           | Notes                                                                                    |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| id                | uuid PK                                        |                                                                                          |
| org_id            | uuid FK                                        | nullable for built-in catalog                                                            |
| name              | text not null                                  | e.g., `eLearning Module`, `Instructor-Led Training`, `Job Aid`, `Video`, `Microlearning` |
| dev_to_seat_ratio | numeric(6,2) not null                          | hours of dev per hour of seat-time                                                       |
| description       | text                                           |                                                                                          |
| is_built_in       | boolean not null default false                 |                                                                                          |
| is_archived       | boolean not null default false                 |                                                                                          |
| UNIQUE            | (coalesce(org_id, '00000000-...'::uuid), name) |                                                                                          |

Built-in seed values follow industry-standard ATD ratios:

| name                           | ratio |
| ------------------------------ | ----- |
| Instructor-Led Training        | 43    |
| Self-Paced eLearning (Level 2) | 184   |
| Self-Paced eLearning (Level 3) | 490   |
| Microlearning                  | 35    |
| Job Aid                        | 12    |
| Video (produced)               | 80    |
| Webinar                        | 25    |

### 8.7 `tra_deliverables`

| Column                | Type                               | Notes                                                |
| --------------------- | ---------------------------------- | ---------------------------------------------------- |
| id                    | uuid PK                            |                                                      |
| org_id                | uuid FK                            |                                                      |
| tra_id                | uuid FK                            |                                                      |
| deliverable_type_id   | uuid FK                            |                                                      |
| name                  | text not null                      | "Onboarding eLearning Module 1"                      |
| seat_time_hours       | numeric(6,2) not null              |                                                      |
| quantity              | integer not null default 1         |                                                      |
| complexity_multiplier | numeric(4,2) not null default 1.00 | range 0.5–3.0                                        |
| estimated_hours       | numeric(9,2)                       | computed: seat_time _ ratio _ quantity \* multiplier |
| notes                 | text                               |                                                      |

---

## 9. Special projects (training initiative management)

### 9.1 `projects`

| Column                                                  | Type                             | Notes                                                           |
| ------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| id                                                      | uuid PK                          |                                                                 |
| org_id                                                  | uuid FK                          |                                                                 |
| name                                                    | text not null                    |                                                                 |
| description                                             | text                             |                                                                 |
| bucket_id                                               | uuid FK → allocation_buckets     |                                                                 |
| priority                                                | text not null default 'medium'   | enum: `low`, `medium`, `high`, `critical`                       |
| status                                                  | text not null default 'planning' | enum: `planning`, `active`, `on_hold`, `completed`, `cancelled` |
| start_date                                              | date                             |                                                                 |
| end_date                                                | date                             |                                                                 |
| total_estimated_hours                                   | numeric(9,2)                     |                                                                 |
| source_tra_id                                           | uuid FK → tras                   |                                                                 |
| public_share_token                                      | uuid                             | nullable; for read-only external view                           |
| deleted_at                                              | timestamptz                      |                                                                 |
| created_at, updated_at, created_by, updated_by, version |                                  |                                                                 |

### 9.2 `project_team_members`

Roster for the project. Includes both internal instructors and external members.

| Column          | Type                             | Notes                                                        |
| --------------- | -------------------------------- | ------------------------------------------------------------ |
| id              | uuid PK                          |                                                              |
| org_id          | uuid FK                          |                                                              |
| project_id      | uuid FK                          |                                                              |
| instructor_id   | uuid FK → instructors            | nullable; set when member is internal                        |
| external_name   | text                             | for non-instructor team members                              |
| external_email  | citext                           |                                                              |
| role            | text                             | "Lead Designer", "SME", etc.                                 |
| member_type     | text not null default 'internal' | enum: `internal`, `external`                                 |
| committed_hours | numeric(7,2) not null default 0  | project-level allocation that flows into instructor workload |

### 9.3 `tasks`

| Column           | Type                                                 | Notes                                                      |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| id               | uuid PK                                              |                                                            |
| org_id           | uuid FK                                              |                                                            |
| project_id       | uuid FK                                              |                                                            |
| name             | text not null                                        |                                                            |
| description      | text                                                 |                                                            |
| status           | text not null default 'not_started'                  | enum: `not_started`, `in_progress`, `on_hold`, `completed` |
| priority         | text not null default 'medium'                       |                                                            |
| start_date       | date                                                 |                                                            |
| end_date         | date                                                 |                                                            |
| estimated_hours  | numeric(7,2)                                         |                                                            |
| actual_hours     | numeric(7,2)                                         |                                                            |
| percent_complete | integer not null default 0 check (between 0 and 100) |                                                            |
| sort_order       | integer not null default 0                           |                                                            |

### 9.4 `task_assignments`

| Column          | Type                              | Notes |
| --------------- | --------------------------------- | ----- |
| task_id         | uuid FK PK                        |       |
| team_member_id  | uuid FK PK → project_team_members |       |
| org_id          | uuid FK                           |       |
| allocated_hours | numeric(7,2)                      |       |

### 9.5 `task_action_items`

| Column       | Type                           | Notes |
| ------------ | ------------------------------ | ----- |
| id           | uuid PK                        |       |
| org_id       | uuid FK                        |       |
| task_id      | uuid FK                        |       |
| description  | text not null                  |       |
| assigned_to  | uuid FK → project_team_members |       |
| due_date     | date                           |       |
| is_complete  | boolean not null default false |       |
| completed_at | timestamptz                    |       |
| sort_order   | integer not null default 0     |       |

### 9.6 `milestones`

| Column      | Type          | Notes |
| ----------- | ------------- | ----- |
| id          | uuid PK       |       |
| org_id      | uuid FK       |       |
| project_id  | uuid FK       |       |
| name        | text not null |       |
| target_date | date not null |       |
| achieved_at | timestamptz   |       |
| description | text          |       |

### 9.7 `dependencies`

External or technical dependencies tracked separately from task-to-task relationships.

| Column                 | Type                         | Notes                                                             |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------- |
| id                     | uuid PK                      |                                                                   |
| org_id                 | uuid FK                      |                                                                   |
| project_id             | uuid FK                      |                                                                   |
| name                   | text not null                |                                                                   |
| dependency_type        | text not null                | enum: `external`, `internal`, `technical`, `vendor`, `regulatory` |
| owner                  | text                         |                                                                   |
| target_resolution_date | date                         |                                                                   |
| status                 | text not null default 'open' | enum: `open`, `at_risk`, `resolved`, `blocked`                    |
| description            | text                         |                                                                   |

### 9.8 `task_dependencies`

Task-to-task ordering for the Gantt chart.

| Column              | Type                                    | Notes                                                                            |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| predecessor_task_id | uuid FK PK                              |                                                                                  |
| successor_task_id   | uuid FK PK                              |                                                                                  |
| org_id              | uuid FK                                 |                                                                                  |
| dependency_kind     | text not null default 'finish_to_start' | enum: `finish_to_start`, `start_to_start`, `finish_to_finish`, `start_to_finish` |
| lag_days            | integer not null default 0              |                                                                                  |

---

## 10. Training Planner (implementation planning)

### 10.1 `implementations`

| Column                                                  | Type                          | Notes                                                               |
| ------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| id                                                      | uuid PK                       |                                                                     |
| org_id                                                  | uuid FK                       |                                                                     |
| name                                                    | text not null                 |                                                                     |
| description                                             | text                          |                                                                     |
| go_live_date                                            | date                          |                                                                     |
| training_start_date                                     | date                          |                                                                     |
| training_end_date                                       | date                          |                                                                     |
| status                                                  | text not null default 'draft' | enum: `draft`, `scheduled`, `in_progress`, `completed`, `cancelled` |
| linked_project_id                                       | uuid FK → projects            | nullable                                                            |
| created_at, updated_at, created_by, updated_by, version |                               |                                                                     |

### 10.2 `impl_rooms`

| Column                  | Type                                       | Notes |
| ----------------------- | ------------------------------------------ | ----- |
| id                      | uuid PK                                    |       |
| org_id                  | uuid FK                                    |       |
| implementation_id       | uuid FK                                    |       |
| name                    | text not null                              |       |
| location                | text                                       |       |
| seat_capacity           | integer not null check (seat_capacity > 0) |       |
| available_hours_per_day | numeric(4,2) not null default 8.00         |       |

### 10.3 `impl_trainers`

A trainer for the implementation. May or may not be a system instructor.

| Column                      | Type                                | Notes                              |
| --------------------------- | ----------------------------------- | ---------------------------------- |
| id                          | uuid PK                             |                                    |
| org_id                      | uuid FK                             |                                    |
| implementation_id           | uuid FK                             |                                    |
| instructor_id               | uuid FK → instructors               | nullable for external trainers     |
| name                        | text not null                       | denormalized for external trainers |
| email                       | citext                              |                                    |
| availability_hours_per_week | numeric(5,2) not null default 40.00 |                                    |
| max_concurrent_sessions     | integer not null default 1          |                                    |

### 10.4 `impl_modules`

Logical grouping of classes for the implementation.

| Column            | Type                       | Notes |
| ----------------- | -------------------------- | ----- |
| id                | uuid PK                    |       |
| org_id            | uuid FK                    |       |
| implementation_id | uuid FK                    |       |
| name              | text not null              |       |
| description       | text                       |       |
| sort_order        | integer not null default 0 |       |

### 10.5 `impl_classes`

Class instances within an implementation. Distinct from the catalog `classes` table because the same catalog class can be used across multiple implementations with different parameters.

| Column                        | Type                          | Notes                          |
| ----------------------------- | ----------------------------- | ------------------------------ |
| id                            | uuid PK                       |                                |
| org_id                        | uuid FK                       |                                |
| implementation_id             | uuid FK                       |                                |
| module_id                     | uuid FK → impl_modules        | nullable                       |
| catalog_class_id              | uuid FK → classes             | nullable; link if from catalog |
| name                          | text not null                 |                                |
| hours_per_session             | numeric(5,2) not null         |                                |
| expected_learners_per_session | integer not null check (> 0)  |                                |
| total_people_to_train         | integer not null check (>= 0) |                                |
| prerequisites                 | uuid[]                        | array of impl_class ids        |

### 10.6 `impl_class_trainers`

Which trainers can deliver which classes.

| Column          | Type       | Notes |
| --------------- | ---------- | ----- |
| impl_class_id   | uuid FK PK |       |
| impl_trainer_id | uuid FK PK |       |
| org_id          | uuid FK    |       |

### 10.7 `impl_sessions`

Concrete scheduled session blocks generated by the planner.

| Column            | Type                           | Notes                                   |
| ----------------- | ------------------------------ | --------------------------------------- |
| id                | uuid PK                        |                                         |
| org_id            | uuid FK                        |                                         |
| implementation_id | uuid FK                        |                                         |
| impl_class_id     | uuid FK                        |                                         |
| impl_room_id      | uuid FK                        |                                         |
| impl_trainer_id   | uuid FK                        |                                         |
| starts_at         | timestamptz not null           |                                         |
| ends_at           | timestamptz not null           |                                         |
| seats_booked      | integer not null default 0     |                                         |
| has_conflict      | boolean not null default false | computed by trigger                     |
| conflict_kind     | text                           | enum: `none`, `trainer`, `room`, `both` |

Indexes: `(org_id, starts_at)`, `(impl_trainer_id, starts_at)`, `(impl_room_id, starts_at)`.

A trigger `recompute_session_conflicts(impl_id)` updates `has_conflict` whenever sessions are inserted, updated, or deleted in an implementation.

---

## 11. The unified workload view

This is the most important object in the database. It is the single source of truth for "how busy is this instructor."

### 11.1 `v_instructor_workload`

A view that unions all six sources into one row per (instructor, source, period). Aggregations roll up from here.

```sql
create or replace view public.v_instructor_workload as
-- Source 1: Classes
select
  o.id                    as org_id,
  cia.instructor_id       as instructor_id,
  'class'                 as source,
  c.id                    as source_id,
  c.name                  as source_label,
  cia.assigned_offerings  as quantity,
  ((case when c.is_multi_day and c.custom_day_hours is not null
      then (select sum(h) from unnest(c.custom_day_hours) h)
      else coalesce(c.hours_per_day, 0) * c.total_days end)
   + c.prep_hours_per_offering + c.logistics_hours_per_offering
  ) * cia.assigned_offerings as annual_hours,
  c.allocation_bucket_id  as bucket_id
from class_instructor_assignments cia
join classes c on c.id = cia.class_id and c.deleted_at is null
join organizations o on o.id = c.org_id
where cia.assigned_offerings > 0

union all
-- Source 2: Recurring tasks
select
  rt.org_id,
  rta.instructor_id,
  'recurring_task',
  rt.id,
  rt.name,
  null,
  rt.hours_per_occurrence
    * coalesce(rt.occurrences_per_year, public.frequency_to_annual(rt.frequency))
    * (rta.share_percent / 100.0),
  rt.bucket_id
from recurring_task_assignments rta
join recurring_tasks rt on rt.id = rta.recurring_task_id and rt.deleted_at is null
where rt.status = 'active'

union all
-- Source 3: Special project allocations (project-level commitment)
select
  ptm.org_id,
  ptm.instructor_id,
  'project',
  p.id,
  p.name,
  null,
  ptm.committed_hours,
  p.bucket_id
from project_team_members ptm
join projects p on p.id = ptm.project_id and p.deleted_at is null
where ptm.member_type = 'internal'
  and ptm.instructor_id is not null
  and p.status in ('planning','active','on_hold')

union all
-- Source 4: Project task assignments (task-level)
select
  ta.org_id,
  ptm.instructor_id,
  'project_task',
  t.id,
  t.name,
  null,
  ta.allocated_hours,
  p.bucket_id
from task_assignments ta
join project_team_members ptm on ptm.id = ta.team_member_id
join tasks t on t.id = ta.task_id
join projects p on p.id = t.project_id and p.deleted_at is null
where ptm.instructor_id is not null
  and t.status <> 'completed'

union all
-- Source 5: Ad-hoc tasks
select
  aht.org_id,
  aht.instructor_id,
  'ad_hoc_task',
  aht.id,
  aht.name,
  null,
  aht.hours,
  aht.bucket_id
from ad_hoc_tasks aht
where aht.instructor_id is not null
  and aht.status in ('open','in_progress')

union all
-- Source 6: Education request assignments
select
  era.org_id,
  era.instructor_id,
  'education_request',
  er.id,
  er.title,
  null,
  era.estimated_hours,
  null::uuid
from education_request_assignments era
join education_requests er on er.id = era.request_id and er.deleted_at is null
where er.status in ('approved','assigned','in_progress');
```

### 11.2 `v_instructor_capacity`

Per-instructor rollup with utilization.

```sql
create or replace view public.v_instructor_capacity as
select
  i.org_id,
  i.id                                          as instructor_id,
  i.full_name,
  i.annual_hours,
  coalesce(sum(w.annual_hours), 0)              as assigned_hours,
  coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) * 100 as utilization_pct,
  case
    when coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) >= 0.95 then 'over_allocated'
    when coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) >= 0.80 then 'at_risk'
    when coalesce(sum(w.annual_hours), 0) / nullif(i.annual_hours, 0) >= 0.40 then 'balanced'
    else 'under_utilized'
  end as utilization_status
from instructors i
left join v_instructor_workload w on w.instructor_id = i.id
where i.deleted_at is null and i.status = 'active'
group by i.org_id, i.id, i.full_name, i.annual_hours;
```

### 11.3 `v_bucket_consumption`

Per-bucket roll-up for the dashboard and reports.

```sql
create or replace view public.v_bucket_consumption as
select
  org_id, bucket_id,
  sum(annual_hours) as consumed_hours
from v_instructor_workload
where bucket_id is not null
group by org_id, bucket_id;
```

### 11.4 Capacity forecast

8-week forward forecast is computed by an RPC that distributes annual hours across weeks based on:

- For classes: spread across `offerings_per_year` evenly across 52 weeks (refined later)
- For recurring tasks: per-frequency cadence
- For project tasks: linear distribution between `start_date` and `end_date`
- For ad-hoc tasks: consumed in the week of `due_date`

```sql
create or replace function public.instructor_capacity_forecast(
  p_instructor_id uuid, p_start date, p_weeks integer default 8
) returns table (
  week_start date, projected_hours numeric, weekly_capacity numeric, utilization_pct numeric
);
```

The implementation uses `generate_series` over the requested weeks and joins each source with appropriate distribution logic.

---

## 12. Support tickets and notifications

### 12.1 `support_tickets`

| Column       | Type                           | Notes                                                                |
| ------------ | ------------------------------ | -------------------------------------------------------------------- |
| id           | uuid PK                        |                                                                      |
| org_id       | uuid FK                        |                                                                      |
| submitted_by | uuid FK → auth.users           |                                                                      |
| subject      | text not null                  |                                                                      |
| category     | text not null                  | enum: `question`, `bug`, `feature_request`, `account`, `other`       |
| priority     | text not null default 'normal' | enum: `low`, `normal`, `high`, `urgent`                              |
| status       | text not null default 'open'   | enum: `open`, `in_progress`, `waiting_on_user`, `resolved`, `closed` |
| description  | text not null                  |                                                                      |
| resolved_at  | timestamptz                    |                                                                      |

### 12.2 `support_ticket_messages`

| Column           | Type                 | Notes                 |
| ---------------- | -------------------- | --------------------- |
| id               | uuid PK              |                       |
| org_id           | uuid FK              |                       |
| ticket_id        | uuid FK              |                       |
| author_id        | uuid FK → auth.users |                       |
| author_kind      | text not null        | enum: `user`, `admin` |
| body             | text not null        |                       |
| read_by_user_at  | timestamptz          |                       |
| read_by_admin_at | timestamptz          |                       |

### 12.3 `notifications` (in-app)

| Column       | Type                      | Notes                                                     |
| ------------ | ------------------------- | --------------------------------------------------------- |
| id           | uuid PK                   |                                                           |
| org_id       | uuid FK                   |                                                           |
| recipient_id | uuid FK → auth.users      |                                                           |
| kind         | text not null             | e.g., `cert_expiring`, `request_assigned`, `task_overdue` |
| title        | text not null             |                                                           |
| body         | text                      |                                                           |
| link         | text                      |                                                           |
| read_at      | timestamptz               |                                                           |
| created_at   | timestamptz default now() |                                                           |

---

## 13. Reports (saved and scheduled)

### 13.1 `saved_reports`

| Column        | Type                           | Notes                                                                                                         |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| id            | uuid PK                        |                                                                                                               |
| org_id        | uuid FK                        |                                                                                                               |
| name          | text not null                  |                                                                                                               |
| report_kind   | text not null                  | enum: `resource_allocation`, `instructor_workload`, `class_coverage`, `project_status`, `skill_gap`, `custom` |
| filters       | jsonb not null default '{}'    |                                                                                                               |
| is_shared     | boolean not null default false |                                                                                                               |
| created_by    | uuid FK                        |                                                                                                               |
| schedule_cron | text                           | optional cron string for emailed reports                                                                      |

### 13.2 `report_runs`

| Column          | Type                      | Notes                      |
| --------------- | ------------------------- | -------------------------- |
| id              | uuid PK                   |                            |
| org_id          | uuid FK                   |                            |
| saved_report_id | uuid FK                   | nullable for ad-hoc runs   |
| run_at          | timestamptz default now() |                            |
| run_by          | uuid FK → auth.users      |                            |
| output_format   | text not null             | enum: `pdf`, `xlsx`, `csv` |
| storage_path    | text                      | path in Supabase Storage   |
| row_count       | integer                   |                            |

---

## 14. Background jobs (pg_cron schedule)

These are configured once during Phase 0 setup.

| Job name                     | Schedule    | Function                                 | Purpose                                                       |
| ---------------------------- | ----------- | ---------------------------------------- | ------------------------------------------------------------- |
| `expire_certifications`      | `0 6 * * *` | `notify_expiring_certifications()`       | Notify managers of certs expiring in 30 days                  |
| `recurring_task_health`      | `0 5 * * 1` | `validate_recurring_tasks()`             | Flag any allocation totals over 100%                          |
| `weekly_capacity_snapshot`   | `0 7 * * 1` | `snapshot_capacity()`                    | Persist capacity numbers for trend reports                    |
| `audit_log_cleanup`          | `0 3 1 * *` | `prune_audit_log(retention_days := 365)` | Hold audit log to 1 year by default                           |
| `request_aging_notification` | `0 8 * * *` | `notify_aging_requests()`                | Flag requests in `new` or `under_review` for >5 business days |

---

## 15. Sequencing (which migrations run in what order)

Migrations are numbered. Phase 0 prompt sets up the structure; subsequent phases add tables.

```
supabase/migrations/
  20260101000001_extensions.sql            -- pg_cron, citext, pgcrypto
  20260101000002_helpers.sql               -- helper functions, generic triggers
  20260101000003_organizations.sql         -- organizations, memberships, invitations
  20260101000004_audit_log.sql             -- audit_log table + apply_standard_triggers
  20260101000005_feature_flags.sql
  20260102000001_instructors.sql
  20260102000002_skills.sql
  20260103000001_classes.sql
  20260104000001_allocations_buckets.sql
  20260104000002_allocations_global.sql
  20260104000003_allocations_groups.sql
  20260104000004_allocations_individual.sql
  20260104000005_recurring_and_adhoc.sql
  20260105000001_workload_views.sql        -- v_instructor_workload, v_instructor_capacity
  20260106000001_education_requests.sql
  20260106000002_tras.sql
  20260106000003_public_intake.sql
  20260107000001_projects.sql
  20260107000002_tasks_and_actions.sql
  20260107000003_milestones_dependencies.sql
  20260108000001_implementations.sql
  20260108000002_impl_sessions_conflicts.sql
  20260109000001_support_tickets.sql
  20260109000002_notifications.sql
  20260110000001_saved_reports.sql
  20260110000002_pg_cron_jobs.sql
```

---

## 16. Type-safety pipeline

After each migration:

```bash
supabase gen types typescript --linked > apps/web/src/lib/database.types.ts
```

These generated types are the input to Zod schemas in `apps/web/src/lib/schemas/`. Zod schemas are the input to Server Actions and form components. There is no untyped boundary anywhere in the stack.
