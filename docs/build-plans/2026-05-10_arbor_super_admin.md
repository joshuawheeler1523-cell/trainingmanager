# Arbor Super-Admin Console

**Status:** planned 2026-05-10 — building now.

## Why

Today, "running" Arbor as a business means SQL-against-Supabase for every observation: who signed up, what did they do, what's owed, what's broken. There is no UI for the platform owner. This document specs the cockpit.

## Audience

- **You** (platform owner / Arbor staff, defined as: any auth.users.id in the `ARBOR_ADMIN_USER_IDS` env var). v1 is single-role; later we can split into `arbor_admin` (full access) + `arbor_support` (read-only).

## Non-goals (deferred to v2)

- Customer impersonation (sign in as another user for support). Needs a Supabase `generateLink({ type: 'magiclink' })` flow, an impersonation-session cookie, and audit-trail UX. ~1 session of work; punt until first paying customer asks.
- SOC 2 compliance dashboard (status of evidence, last restore drill, etc). Drata will be the source of truth here.
- Custom-built status-incident UI — covered as a separate milestone (we already have the public `/status` page reading from the DB; admins post incidents via SQL today, UI lands in v1.5).

## Routes & navigation

All under `/arbor/*`, gated by `isArborAdmin()` on every page + every action. Has its own layout with a left side nav distinct from the main app + the agency console.

```
/arbor                        Overview dashboard
/arbor/agencies               All agencies list
/arbor/agencies/new           Manual create form (white-glove signup)
/arbor/agencies/[id]          Agency detail
/arbor/orgs                   All organizations list (every agency + standalone)
/arbor/orgs/[id]              Org detail
/arbor/users                  All users list
/arbor/users/[id]             User detail
/arbor/billing                Cross-platform billing operations
/arbor/audit                  Cross-platform audit log
/arbor/incidents              Status-page incidents (post + update + resolve)
/arbor/baa                    BAA workflow management
```

Main app gets a small "🛡 Arbor admin" pill in the header for users whose id is in `ARBOR_ADMIN_USER_IDS`.

## Schema additions

Minimal — most data we need is already in place.

```sql
-- Suspension flags. Both nullable; non-null means "suspended at this time".
alter table public.agencies       add column suspended_at timestamptz;
alter table public.organizations  add column suspended_at timestamptz;

-- Optional reason field surfaced when suspended users hit a gated route.
alter table public.agencies       add column suspended_reason text;
alter table public.organizations  add column suspended_reason text;
```

Proxy + gated layouts check `suspended_at`; suspended tenants get a polite "this account has been temporarily suspended — contact support@arbor.app" page rather than a 500.

No new tables. The existing tables (`agencies`, `organizations`, `org_memberships`, `agency_memberships`, `client_contracts`, `arbor_invoices`, `audit_log`, `status_incidents`, `baa_requests`) cover everything below.

## Page-by-page

### `/arbor` — Overview dashboard

Headline KPI strip:

- **Agencies**: total, +N this month, X on trial
- **Client orgs**: total across all agencies, +N this month
- **Total users**: with N active in last 30 days
- **Total ACV under contract**: USD across active contracts
- **Monthly rev-share owed**: this period's accumulated rev share across all agencies (reuses the calculation engine from /agency/billing)
- **Outstanding invoices**: count + total cents

Below the strip, two columns:

- **Recent signups** (last 14 days) — agency name, signup date, # client orgs provisioned since, contract status
- **Activity feed** — last 50 platform-significant events (agency created, contract closed, invoice paid, BAA requested, status incident posted)

Sidebar links to every other section.

### `/arbor/agencies` — All agencies

Sortable/filterable table:

| Column             | Source                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| Agency name + slug | `agencies`                                                                  |
| Created            | `agencies.created_at`                                                       |
| Client orgs        | count from `organizations.agency_id`                                        |
| Contracts          | count of active `client_contracts`                                          |
| ACV under contract | sum of `client_contracts.annual_contract_value_cents` where status='active' |
| Custom domain      | `agencies.custom_domain` (or "—")                                           |
| Last activity      | max(audit_log.occurred_at across orgs in this agency)                       |
| Status             | active / suspended                                                          |

Filter chips: status, has-contract, has-domain. Search by name/slug. "+ New agency" button.

### `/arbor/agencies/new` — Manual create form

Inputs: agency name, slug (auto-from-name), admin email, admin full name, optional custom rev share %, optional initial trial-period days. Server action:

1. Conflict checks (slug taken, email taken — same as the self-serve flow)
2. Create `agencies` row
3. Create `auth.users` for admin email (via admin.auth.admin.createUser)
4. Create `agency_memberships` row with role=agency_admin + accepted_at=now
5. Generate magic-link via Supabase admin
6. Send "Welcome to Arbor — your agency is set up" email via Resend
7. Audit-log: `ARBOR_ADMIN_AGENCY_CREATED` with the staff member's id

Returns to `/arbor/agencies/[id]`.

### `/arbor/agencies/[id]` — Agency detail

Tabs:

- **Overview** — name, slug, created, custom domain status, branding preview, default rev share %, billing email, payment terms, suspension state, # members, # client orgs, total ACV
- **Client orgs** — table of all orgs under this agency (name, members, contract status, ACV, last activity, suspended)
- **Contracts** — full contracts table with status filters
- **Invoices** — full invoice history with payment status
- **Members** — agency_admins + agency_members with last sign-in
- **Activity** — audit_log entries scoped to this agency's tenants
- **Settings** — edit name/slug, override default rev share, suspend/unsuspend, delete

### `/arbor/orgs` — All organizations

Same shape as agencies list but for client orgs (and standalone orgs that don't belong to any agency). Filter by parent agency dropdown.

### `/arbor/orgs/[id]` — Org detail

Tabs:

- **Overview** — name, slug, parent agency (if any), preset, created, # members, # tras, # projects, # classes, # instructors, capacity health summary, suspension state
- **Members** — org_memberships with role, last sign-in
- **Activity** — audit_log scoped to this org
- **Storage** — data export count, branding storage usage
- **Settings** — change name/preset, reassign to different agency, suspend/unsuspend, delete

### `/arbor/users` — All users

Search-first table (most operators come here looking for a specific user by email).

| Column          | Source                            |
| --------------- | --------------------------------- |
| Email           | `auth.users`                      |
| Full name       | user_metadata.full_name           |
| Created         | created_at                        |
| Last sign-in    | last_sign_in_at                   |
| Email confirmed | email_confirmed_at IS NOT NULL    |
| Memberships     | count of org + agency memberships |

Filter chips: signed in last 7d / 30d / never, email unconfirmed, has agency role.

### `/arbor/users/[id]` — User detail

Profile + memberships + recent activity (audit_log where actor_id=user.id) + admin actions:

- Send password reset email
- Resend email confirmation
- Force sign-out everywhere
- Suspend user (sets a `banned_until` on auth.users via admin API)
- Delete user (cascades — same logic as the user's self-delete)

### `/arbor/billing` — Cross-platform billing operations

KPI strip:

- Monthly rev share owed (sum across all agencies, current period)
- Collected MTD
- Outstanding (sent + overdue)
- Last cron run timestamp

Tabs:

- **Invoices** — every invoice across every agency, filter by status/agency/period. Bulk-select + bulk mark-paid with shared payment-method/reference inputs.
- **Run cron** — manual trigger of `generate_monthly_invoices_for_period(start, end)` with a date-range picker. Returns the per-agency result.
- **Generate ad-hoc invoice** — for any agency, any period (reuses existing `generateInvoiceNowAction`).

### `/arbor/audit` — Cross-platform audit log

Same UI as the existing `/admin/audit` but with two extra filter dropdowns: org and agency. Plus CSV export button.

### `/arbor/incidents` — Status incidents

List of all incidents (open + resolved). "+ New incident" form: title, body, severity, status. "+ Post update" form on each open incident. Mark resolved button.

### `/arbor/baa` — BAA workflow management

List of all `baa_requests` across all orgs. Per-row: org, requested by, status, signer info, signed_at. Action buttons:

- **Open** — view detail
- **Upload signed PDF** — admin uploads countersigned PDF to `baa-documents` storage (new bucket), flips status to "signed"
- **Mark sent** — flips status from "requested" to "sent" (you've delivered the PDF for signature)
- **Mark rejected** — flips status with a reason

## Auth helper

```ts
// apps/web/src/lib/auth/arbor-admin.ts
export async function isArborAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const list = (process.env["ARBOR_ADMIN_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(user.id);
}
export async function requireArborAdmin(): Promise<void> {
  if (!(await isArborAdmin())) throw new Error("Arbor admin only");
}
```

Layout at `/arbor/layout.tsx` calls `isArborAdmin()` and renders a 403 page if false. Every server action under `/arbor` checks the same.

## Audit log conventions

Every Arbor-admin action writes to audit*log with `operation` prefixed `ARBOR_ADMIN*\*`:

- `ARBOR_ADMIN_AGENCY_CREATED` / `_UPDATED` / `_SUSPENDED` / `_UNSUSPENDED` / `_DELETED`
- `ARBOR_ADMIN_ORG_REASSIGNED` / `_SUSPENDED` / etc
- `ARBOR_ADMIN_USER_PASSWORD_RESET_SENT` / `_SUSPENDED` / `_DELETED`
- `ARBOR_ADMIN_INVOICE_BULK_PAID` / `_GENERATED`
- `ARBOR_ADMIN_INCIDENT_POSTED` / `_RESOLVED`
- `ARBOR_ADMIN_BAA_SENT` / `_MARKED_SIGNED`

`new_values` carries the operation specifics. Same convention as the existing audit_log usage in /agency/billing.

## Build phases (commits)

| Phase   | What                                                                                                    | Files                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **A1**  | Schema (suspend cols), `isArborAdmin` helper, `/arbor` layout + 403 + side nav, header pill in main app | migration, lib/auth/arbor-admin.ts, app/(authenticated)/arbor/layout.tsx, components/layout/header (or wherever the Arbor admin pill goes) |
| **A2**  | `/arbor` overview dashboard                                                                             | app/(authenticated)/arbor/page.tsx                                                                                                         |
| **A3**  | `/arbor/agencies` list + detail + new (manual create)                                                   | app/(authenticated)/arbor/agencies/\* + actions.ts                                                                                         |
| **A4**  | `/arbor/orgs` list + detail                                                                             | app/(authenticated)/arbor/orgs/\*                                                                                                          |
| **A5**  | `/arbor/users` list + detail + admin actions                                                            | app/(authenticated)/arbor/users/\*                                                                                                         |
| **A6**  | `/arbor/billing` cross-platform invoice ops                                                             | app/(authenticated)/arbor/billing/\* + new bulk actions                                                                                    |
| **A7**  | `/arbor/audit` cross-platform viewer                                                                    | app/(authenticated)/arbor/audit/\*                                                                                                         |
| **A8**  | `/arbor/incidents` status incident posting                                                              | app/(authenticated)/arbor/incidents/\*                                                                                                     |
| **A9**  | `/arbor/baa` BAA management                                                                             | app/(authenticated)/arbor/baa/\* + storage bucket                                                                                          |
| **A10** | Wire suspension into proxy + agency layout + org layout                                                 | proxy.ts, agency/layout.tsx, (authenticated)/layout.tsx                                                                                    |

Each phase: build → lint → test → commit → push. ~10 commits total.

## Test plan

After build:

- Sign in as Arbor admin user (in `ARBOR_ADMIN_USER_IDS`)
- Visit `/arbor` — see counts populated (will show 0 / 1s on a fresh tenant)
- Manually create an agency at `/arbor/agencies/new` — verify it appears in list
- Switch to that agency's admin account → verify they see /agency normally
- Suspend the agency from `/arbor/agencies/[id]/settings` — verify the agency_admin can't access /agency anymore (sees suspension page)
- Unsuspend — verify access restored
- Sign in as non-Arbor-admin → visit /arbor → verify 403
- Sign out → visit /arbor → verify redirect to /login
