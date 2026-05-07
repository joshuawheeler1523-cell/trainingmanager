# Arbor — Technical Architecture

Stack, structure, conventions, security model, and the patterns that make the rebuild durable.

**Document 1 of 4 — Build Package**

---

## 1. What this document covers

This is the architectural reference for the rebuild. It explains the technology choices, the structural decisions, and the patterns every engineer (human or AI) is expected to apply consistently across the codebase. Each decision is presented with its rationale. Many of these choices are not the only reasonable options — they are the choices we are making. Departures from them require a documented reason, not a preference.

This document complements the Data Model (document 02) and the Build Prompts (document 03). Where this document and those disagree, **this document is the source of truth on architecture; the data model is the source of truth on schema; the build prompts execute against both.**

---

## 2. The stack at a glance

| Layer          | Choice                                         | Why                                                                                                       |
| -------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Web framework  | Next.js 15 (App Router)                        | Server Components for fast first render; Server Actions for type-safe mutations; mature deployment story. |
| Language       | TypeScript (strict)                            | `noUncheckedIndexedAccess` on. End-to-end type safety from DB to UI.                                      |
| Database       | PostgreSQL 15+ via Supabase                    | RLS for multi-tenancy, pg_cron for scheduled jobs, generated TS types, mature ops.                        |
| Auth           | Supabase Auth (magic link + password)          | Matches the original product spec; integrates with RLS via JWT claims.                                    |
| UI primitives  | shadcn/ui + Radix + Tailwind                   | Owned-in-repo components; no opaque dependencies; full theming control.                                   |
| Forms          | react-hook-form + Zod                          | Schema-first validation; same Zod schema validates client and server.                                     |
| Tables         | @tanstack/react-table v8                       | Headless, fully customizable; works with our DataTable wrapper.                                           |
| Charts         | Recharts for standard charts; SVG/D3 for Gantt | Recharts is good enough for 90% of cases; Gantt needs hand-built control.                                 |
| Calendar       | react-big-calendar                             | Mature, MIT-licensed, supports drag-and-drop adjustments.                                                 |
| Drag and drop  | @dnd-kit                                       | Modern, accessible, keyboard-supported; replaces older react-dnd.                                         |
| PDF generation | @react-pdf/renderer                            | React-component-based; no headless browser cold start.                                                    |
| Spreadsheets   | SheetJS (xlsx)                                 | Industry standard for Excel I/O in JavaScript.                                                            |
| Email          | Resend (default) — swappable                   | Modern API, React Email templates, good deliverability.                                                   |
| Testing        | Vitest, Playwright, axe-core                   | Vitest for unit; Playwright for E2E; axe for accessibility.                                               |
| Monitoring     | Sentry (errors) + Vercel Analytics             | Default to managed observability for v1; revisit at scale.                                                |
| Hosting        | Vercel (web) + Supabase (DB)                   | Lowest-friction deployment for the chosen stack.                                                          |
| AI features    | Anthropic API (Claude Sonnet)                  | Used for TRA estimation and Smart Recommendations, behind feature flags.                                  |

---

## 3. Project structure

A pnpm workspace monorepo with three packages.

```
arbor/
├── apps/
│   └── web/                    Next.js 15 application
│       ├── src/
│       │   ├── app/            App Router routes
│       │   │   ├── (authenticated)/   Auth-required pages
│       │   │   │   ├── layout.tsx
│       │   │   │   ├── page.tsx       Dashboard
│       │   │   │   ├── instructors/
│       │   │   │   ├── classes/
│       │   │   │   ├── skills/
│       │   │   │   ├── allocations/
│       │   │   │   ├── tras/
│       │   │   │   ├── request-queue/
│       │   │   │   ├── projects/
│       │   │   │   ├── training-planner/
│       │   │   │   ├── reports/
│       │   │   │   ├── account/
│       │   │   │   └── admin/
│       │   │   ├── (public)/          No-auth routes
│       │   │   │   ├── public/request/[token]/
│       │   │   │   └── public/projects/[token]/
│       │   │   ├── login/
│       │   │   ├── auth/callback/
│       │   │   ├── onboarding/
│       │   │   └── api/               Edge / Route handlers
│       │   ├── components/     Reusable UI components
│       │   │   ├── ui/         shadcn/ui primitives
│       │   │   ├── data-table/
│       │   │   ├── forms/
│       │   │   ├── charts/
│       │   │   └── layout/
│       │   ├── lib/
│       │   │   ├── supabase/   Server + browser clients
│       │   │   ├── auth/       Helpers (current org, guards)
│       │   │   ├── database.types.ts   Generated by Supabase CLI
│       │   │   └── utils.ts
│       │   └── help/           MDX content for help center
│       ├── public/
│       └── tests/              Playwright E2E
├── packages/
│   ├── db/                     Database package
│   │   ├── supabase/
│   │   │   ├── migrations/
│   │   │   ├── seed/
│   │   │   └── config.toml
│   │   └── tests/              SQL tests (workload math etc.)
│   └── shared/                 Code reused by web (and future apps)
│       ├── src/
│       │   ├── schemas/        Zod schemas mirror DB tables
│       │   ├── queries/        Server query helpers
│       │   ├── reports/        Report definitions
│       │   └── utils/
│       └── package.json
├── docs/
│   ├── data_model.md           Copy of doc 02
│   ├── architecture.md         Copy of this doc
│   └── decisions/              ADRs (optional, recommended)
├── .github/workflows/          CI/CD
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

**Where things live:**

- Pages and routes: `apps/web/src/app/`. One folder per route segment. Server Components by default; client components opt-in with `'use client'`.
- Server Actions: co-located with the route they serve, in `actions.ts`. They import Zod schemas from `packages/shared` and database types from `apps/web/src/lib/database.types.ts`.
- Reusable components: `apps/web/src/components/`. Domain-specific components live near their route; truly generic ones go here.
- Database changes: always start in `packages/db/supabase/migrations/`. After every migration, regenerate types via `pnpm db:types`.
- Shared logic between server and client: `packages/shared`. Keep this package framework-agnostic — no Next.js imports, no React Server-only modules.

---

## 4. Multi-tenancy: RLS-first

Every customer is an organization. A user can belong to multiple organizations. Within an organization, a user has a role (`member` or `org_admin`) and a visibility scope (`full` or `limited`). All tenant data carries an `org_id` and is filtered by Postgres Row-Level Security policies.

**The non-negotiable rule:** Every query written against tenant data must work whether or not the application code remembers to filter by `org_id`. Application-level filtering is for performance and clarity. RLS is for correctness. We do not rely on application-level filtering for security, ever.

**How RLS is wired:**

- JWT contains the `user_id` (Supabase default). We do not store `org_id` in the JWT — orgs are looked up via `org_memberships` at every request.
- A SQL helper `user_org_ids()` returns the set of `org_id`s the current authenticated user has **accepted** memberships in.
- Every tenant table has two policies: one for SELECT and one for ALL (insert/update/delete), both keyed off `user_org_ids()`.
- Sensitive tables (memberships, invitations, settings, audit_log access) get an additional policy keyed off `is_org_admin(org_id)`.
- Service-role queries (only used in Edge Functions and migrations) bypass RLS — those code paths are reviewed manually.

**Why not put `org_id` in a JWT claim?** Org membership changes — an admin removes a user, a user accepts a new invite, a user is upgraded to `org_admin`. Putting `org_id` in the JWT means we either re-issue the token on every membership change (operationally annoying) or accept stale claims (a security risk). Looking up memberships fresh on every query is slightly more expensive but always correct.

---

## 5. The unified workload view (the heart of the system)

This is the single most important architectural decision in the rebuild. An instructor's total assigned hours has six independent sources: classes, recurring tasks, special projects (committed hours at the project level), project tasks (allocated hours per task), ad-hoc tasks, and education request assignments.

**The new architecture:** All six sources are unified in a single Postgres view (`v_instructor_workload`) with one row per (instructor, source, source_id, annual_hours, bucket_id). Every page that needs to know an instructor's workload reads from this view (or its rollup, `v_instructor_capacity`) and never recomputes from constituent tables.

**Consequences:**

- There is exactly one place to fix when a calculation is wrong.
- SQL test suite in `packages/db/tests/` exercises this view against fixed scenarios.
- Bucket consumption rolls up trivially from this view as `v_bucket_consumption`.
- Capacity forecasting (8-week forward look) is an RPC function `instructor_capacity_forecast`.

**Adding a new source of hours:** Two places only — (1) the new table, (2) one new branch in the `v_instructor_workload` union. No changes to UI code.

---

## 6. Audit logging: triggers, not middleware

Every change to every tenant table writes to `audit_log`. The trigger is applied via `apply_standard_triggers(table_name)` in each migration. There is no "please remember to log this in the action" pattern. Logging happens at the database, regardless of how the change arrives.

**What is captured:** Operation (INSERT/UPDATE/DELETE), table name, record id, org_id, actor_id. For UPDATE: `changed_fields` (list), full `old_values` and `new_values` as jsonb. For DELETE: full `old_values`. Timestamp (`occurred_at`).

**Retention:** 365 days by default. A pg_cron job prunes older rows monthly.

**Performance:** `audit_log` is indexed on `(org_id, occurred_at desc)`, `(org_id, table_name, record_id)`, and `(actor_id, occurred_at desc)`. The audit trigger is omitted on `audit_log` itself — we do not audit the audit log.

---

## 7. Background jobs

Two execution surfaces: pg_cron for scheduled SQL work, Supabase Edge Functions (Deno runtime) for jobs that need TypeScript or external API calls.

**Scheduled via pg_cron** (see data model section 14 for full list):

- `expire_certifications` — daily 06:00
- `recurring_task_health` — Mondays 05:00
- `weekly_capacity_snapshot` — Mondays 07:00
- `audit_log_cleanup` — first of month 03:00
- `request_aging_notification` — daily 08:00

**Edge Functions for external calls:**

- `tra-suggest` — Anthropic API for AI-assisted TRA estimation
- `send-email` — wraps Resend; centralizes email sending with per-org rate limiting
- `export-pdf-async` — large reports; queues work and notifies via in-app notifications when done

---

## 8. Type-safety pipeline

End-to-end type safety has four stages. Each stage's output feeds the next.

```
Postgres tables (source of truth)
  ↓
Database.types.ts  (supabase gen types typescript)
  ↓
Zod schemas in shared package  (typed via Database type)
  ↓
Server Actions  (validate input via Zod)
  ↓
React forms  (resolver: zodResolver(schema))
```

**The discipline:**

- After every migration, run `pnpm db:types`. CI fails if generated types are out of date.
- Zod schemas are in `packages/shared/src/schemas/`. They import the Database type and constrain inputs further.
- Server Actions take the schema's `z.infer<>`'d type, validate at the boundary, and only then call the Supabase client.
- Forms use react-hook-form with `zodResolver(schema)`. The same schema validates both client and server.
- **There is no `any` in the production codebase.** `unknown` is acceptable for narrowing; explicit type assertions require a comment explaining why.

---

## 9. Auth flow

Magic-link first, optional password. Mirrors the original product spec.

**First sign-in:**

1. User enters email at `/login`.
2. Server calls `supabase.auth.signInWithOtp({ email })` — Supabase sends a magic link.
3. User clicks link → lands on `/auth/callback` → code exchanged for session → cookie set.
4. If the user has **no accepted org membership**, they go to `/onboarding`.
5. If they have a pending invitation, they accept it. Otherwise, contact support.
6. Once they have an org, they hit the dashboard.

**Subsequent sign-ins:** Re-request a magic link (always works), or use email + password if set via `/account/set-password`. Sessions last 7 days; refreshed silently on activity.

**Account creation:** In v1, accounts are created only via invitation. Self-service signup is not enabled.

1. Org admin invites email X → row in `org_invitations` with unique token, email sent to X.
2. X clicks link → `/accept-invite/[token]` → if not signed in, prompted (creates `auth.users` row on first magic-link login).
3. After auth, invitation marked accepted, `org_memberships` row created.

**Public surfaces:**

- `/public/request/[token]` — anonymous education request submission, gated by an active row in `public_intake_links`.
- `/public/projects/[token]` — anonymous read-only project status view, gated by `projects.public_share_token`.
- Both rely on token validation before any data access. RLS policies for these surfaces use the anon role with token-checked predicates.

---

## 10. Patterns every contributor follows

### Server Action shape

Every Server Action returns a discriminated union. Never throws to the client.

```typescript
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

export async function createInstructor(input: unknown): Promise<ActionResult<Instructor>> {
  const parsed = instructorInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: parsed.error.errors[0].message,
        field: parsed.error.errors[0].path.join("."),
      },
    };
  }

  const supabase = await createServerClient();
  const orgId = await getCurrentOrgId();
  if (!orgId)
    return { ok: false, error: { code: "NO_ORG", message: "Not signed in to an organization" } };

  const { data, error } = await supabase
    .from("instructors")
    .insert({ ...parsed.data, org_id: orgId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/instructors");
  return { ok: true, data };
}
```

### Component shape

- Server Components do all data fetching. They pass typed data to client components as props.
- Client components handle interactivity, never data fetching (exception: real-time subscriptions and optimistic UI).
- Forms are client components (`"use client"`); they call Server Actions.
- Loading states use Suspense + a skeleton component. Error states use error boundaries with a retry affordance.

### Optimistic concurrency

Tables edited by multiple users (allocations, projects, tasks) include a `version integer` column. Updates include `version` in the WHERE clause; if the row's version has changed, the update returns 0 rows affected and the UI shows a "someone else updated this — review and retry" dialog. Tables that are effectively single-writer skip versioning.

### Soft deletes

Entities with downstream history (instructors, classes, projects, education requests, tras) use `deleted_at`, not DELETE. All queries filter `where deleted_at is null` by default.

### Time zones

All timestamps stored as `timestamptz` (UTC). UI rendering uses the org's configured `time_zone` via date-fns-tz. Dates without times (like `target_completion_date`) are stored as `date`.

---

## 11. Testing strategy

**Unit tests (Vitest):** Every Server Action has a happy-path and error-path test. Pure utilities tested in isolation.

**Database tests (SQL + Vitest):** `packages/db/tests/` runs against an ephemeral Postgres (Supabase local stack). The workload engine has deep coverage: each source of hours, edge cases, rollup math. RLS policies tested by setting `auth.uid()` to different test users.

**E2E tests (Playwright):** Smoke tests for five most common flows: login, add instructor, create class, create TRA, generate report. Visual regression on dashboard and Gantt chart. Cross-tenant isolation test: log in as user A in org X, attempt to access org Y's data, confirm 404 or empty.

**Accessibility:** axe-core runs on every Playwright test; violations fail the test. Manual screen-reader pass on three flows per release. Keyboard-only test on every release.

---

## 12. CI/CD and deployment

**Pull requests:** GitHub Actions runs pnpm install, lint, typecheck, test, build. Vercel creates a preview deployment. Playwright runs against preview URL. `supabase db diff` against linked dev project — fail if migrations don't apply cleanly.

**Main branch (production):** Migrations run first via `supabase migration up`. After success, Vercel promotes the build. If migrations fail, deploy aborts. Post-deploy smoke test pages on-call if it fails.

**Migration discipline:**

- Migrations are forward-only. Mistakes corrected by new migrations.
- Every migration is timestamped (`YYYYMMDDNNNNNN_descriptive_name.sql`).
- Migrations that change a view or function fully replace it (CREATE OR REPLACE).
- Migrations that change a table's schema use ALTER TABLE — never DROP and recreate.

---

## 13. Observability

- **Errors:** Sentry captures errors from browser, server, and Edge Functions. Errors include `org_id` and `user_id` (PII scrubbed).
- **Performance:** Vercel Analytics tracks Core Web Vitals. Supabase dashboard surfaces slow queries; indexes added when query crosses 200ms median. CI runs Lighthouse on top 5 routes; perf < 85 or a11y < 95 fails.
- **Audit:** `audit_log` is the source of truth for what happened. Sentry for what went wrong.
- **Status page:** `status.<APP_DOMAIN>` with auto-incidents triggered by Sentry error rate and Vercel uptime.

---

## 14. Security model

**Cross-tenant data leak (highest severity):** RLS on every table, automated cross-tenant test in CI, security review on any migration that modifies a policy.

**Privilege escalation:** Role changes only by org_admin via the admin page; transitions audited; service-role queries reviewed by hand.

**Token compromise:** Short-lived magic links (1 hour); refresh tokens rotated; secure HttpOnly cookies; CSRF protection on Server Actions.

**Compliance:**

- **HIPAA:** Not in scope for v1. We do not store PHI. If a customer asks: "we don't store any clinical or patient data; the data we do store is workforce operational data and lives behind a SOC 2 Type II provider (Supabase)."
- **SOC 2:** Leverage Supabase's certification for the database layer. We do not pursue our own SOC 2 in v1.
- **GDPR:** Data export and account deletion endpoints exist for every user and every org (processed within 30 days).

---

## 15. Build velocity guidance

| Milestone | Phases                | Approx duration | What it delivers                                                                         |
| --------- | --------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Pilot     | 0, 1, 2, 3, 8 (basic) | 3–4 weeks       | Foundation, instructors, classes, skills, allocations, workload engine, basic dashboard. |
| Beta      | 4, 5                  | +3–4 weeks      | TRAs and education request queue. Stakeholder intake operational.                        |
| GA        | 6, 9                  | +4–5 weeks      | Special projects (Gantt, Kanban, Calendar). Admin polish, support, contextual help.      |
| v1.1      | 7                     | +4–6 weeks      | Training Planner / Implementation. Biggest engineering investment.                       |
| v1.2      | 10                    | +2–3 weeks      | Performance, accessibility, deployment hardening, AI features (feature-flagged).         |

Resist building Phase 7 in v1. The Training Planner has more moving parts than any other module. It will be much better designed after a real pilot organization has used phases 0–5 for a quarter.
