# Build Plan — White-Label Reseller Capability

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Status              | Draft, awaiting user approval to begin Phase 1                                                 |
| Date drafted        | 2026-05-09                                                                                     |
| Estimated effort    | 14–18 working sessions across 9 phases                                                         |
| Engineering elapsed | ~10–12 weeks (compressible with parallel work)                                                 |
| Compliance elapsed  | 6–12 months (SOC 2 audit lead time, runs in parallel)                                          |
| Constraint          | Hospital training gold path + permissions/workspace identity must continue to work end-to-end. |

---

## 1. Summary

Adds the platform capabilities required for **consulting firms to white-label Arbor and resell it to their clients** (hospital training departments, EMR analyst teams, clinical informatics teams, etc.).

Single line: **two-tier hierarchy where Arbor → Agency → Client orgs**, with agency-level branding, custom domains, per-client SSO, agency-paid per-seat billing with tiered packages, REST+webhook public API, and SOC 2 Type II compliance.

This builds on top of the permissions + workspace identity work shipped on 2026-05-09. That work is foundational; the agency tier extends it.

---

## 2. Strategic decisions (locked)

| Decision            | Choice                                                          | Rationale                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hierarchy           | **Two tiers**: Arbor → Agency → Client orgs                     | Cleanest mental model. Every client org belongs to one agency. Three tiers add complexity for marginal benefit.                                                                                  |
| Billing flow        | **Consultant collects from hospital, pays Arbor a rev share %** | Consultant invoices hospital for the full annual amount. Arbor invoices the consultant for accumulated rev share monthly. No Stripe Connect / marketplace plumbing needed for v1.                |
| Custom domains      | **Bring your own domain (BYOD)**                                | Enterprise expectation. `app.consultingfirm.com` not `<firm>.arbor.app`. Higher engineering lift but required for credibility.                                                                   |
| Compliance priority | **SOC 2 Type II first**                                         | Standard enterprise sales gate. HIPAA can follow once SOC 2 controls are in place (most controls overlap).                                                                                       |
| Branding scope      | **Agency-only** (uniform across all client orgs in agency)      | Simplest model. Client-org override can be added in v2 if a large client demands it.                                                                                                             |
| SSO scope           | **Per client org**                                              | Each hospital/customer brings its own IdP (Okta, AzureAD, Google Workspace). Standard enterprise pattern.                                                                                        |
| API shape           | **REST + outbound webhooks (v1)**                               | Consulting firms expect REST; webhooks let them push to their CRM/PMP without polling. GraphQL deferred.                                                                                         |
| Feature tiering     | **NONE — every customer gets every feature**                    | No Starter/Pro/Enterprise feature gates. SSO, custom domain, API, webhooks all available to every client org. Pricing is the only tier.                                                          |
| Pricing model       | **Annual flat tiers by team size, with revenue share to Arbor** | Healthcare buyers expect fixed annual cost; matches how Epic/Cerner/Workday sell. Tiers: Small / Medium / Large / Enterprise based on active user count. Arbor takes a fixed % of each contract. |

### Pricing tier definition

Tier is based on **active end-user count per client org** (anyone with an `org_memberships` row, regardless of role).

| Tier           | Active users | Recommended retail (consultant → hospital) | Arbor's share (30%) |
| -------------- | ------------ | ------------------------------------------ | ------------------- |
| **Small**      | < 25         | $30,000 / year                             | $9,000              |
| **Medium**     | 25–100       | $50,000 / year                             | $15,000             |
| **Large**      | 100–500      | $75,000 / year                             | $22,500             |
| **Enterprise** | 500+         | $100,000+ (custom)                         | negotiated          |

The consultant sets actual retail; Arbor's share is the configured percentage of whatever the consultant invoiced. Tier is recalculated annually at renewal based on the prior year's average active user count; mid-year tier upgrades supported with prorated invoicing.

### Recommendations needing future confirmation

| Open item                               | Recommendation                                                                           | When to decide                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| Revenue share %                         | 30% to Arbor / 70% to consultant — standard B2B reseller channel split                   | Before Phase 5 (billing) ships      |
| 90-day rev-share onramp                 | First 10 agencies: zero up-front; flip to standard 30/70 after 90 days OR first contract | Before launching agency program     |
| Data residency                          | US-only at v1; EU/Canada via separate Supabase project later if a customer requires      | Before SOC 2 audit begins (Phase 7) |
| Agency-admin can create new client orgs | Yes (self-serve provisioning); agency owns the budget so they own the headcount          | Phase 1                             |
| HIPAA timing                            | Phase 7b (after SOC 2 controls land); BAA gates required                                 | After SOC 2 baseline is in place    |

---

## 3. Architecture overview

### 3.1 Database additions

**New tables:**

- `agencies` (id, slug, name, custom_domain, branding fields, default_revenue_share_pct, stripe_customer_id, created_at, etc.)
- `agency_memberships` (agency_id, user_id, role: 'agency_admin' | 'agency_member', accepted_at)
- `sso_configs` (org_id, provider_type, idp_metadata_xml, idp_entity_id, attribute_mapping, enabled)
- `api_keys` (org_id, key_hash, name, scopes[], last_used_at, expires_at, created_by)
- `webhook_endpoints` (org_id, url, secret, events[], enabled, last_delivered_at)
- `webhook_deliveries` (endpoint_id, event_type, payload, response_status, attempted_at) — append-only delivery log
- `client_contracts` (org_id, agency_id, pricing_tier: 'small'/'medium'/'large'/'enterprise', annual_contract_value_cents, revenue_share_pct, contract_start, contract_end, status: 'trial'/'active'/'expired'/'cancelled') — one row per agency-client deal; the source of truth for what Arbor will bill the agency
- `arbor_invoices` (agency_id, stripe_invoice_id, period_start, period_end, total_cents, status, line_items jsonb) — Arbor's monthly bill to the agency, summing rev-share owed across all the agency's active client_contracts
- `billing_events` (agency_id, stripe_event_id, event_type, payload, processed_at) — Stripe webhook idempotency

**Schema additions to existing tables:**

- `organizations.agency_id uuid references agencies(id) on delete set null` — NULL means standalone org (existing behavior preserved)
- `organizations.brand_color`, `logo_url` — already exist; will be supplemented by agency-level overrides
- `audit_log` — no change; agency-level events log to audit_log with `agency_id` populated when relevant

**New helpers (SQL, all SECURITY DEFINER, search_path locked):**

- `current_agency_id()` — returns the calling user's agency_id via agency_memberships lookup
- `is_agency_admin(p_agency_id uuid)` — boolean role check
- `agency_org_ids()` — returns set of org_ids in the user's agency (for cross-org reads)
- `org_belongs_to_agency(p_org_id, p_agency_id)` — predicate helper for RLS

### 3.2 Application layer

- New route segment: `/agency/*` — agency-admin-only console (gated by RoleGuard)
- New auth helper: `apps/web/src/lib/auth/agency.ts` — `getCurrentAgencyId()`, `isAgencyAdmin()`, `requireAgencyAdmin()`
- Hostname-based middleware: read `host` header → look up agency by `custom_domain` → set agency context cookie
- Branding context: agency branding flows through CSS custom properties injected at the layout level
- API surface: `apps/web/src/app/api/v1/*` — REST routes, JSON responses, signed JWT auth via API key

### 3.3 Infrastructure

- Vercel Domains API for cert provisioning (BYOD)
- Stripe Billing for subscription + metering
- Resend per-domain config for white-labeled emails
- WorkOS or Supabase native SAML for per-client-org SSO (decision in Phase 4)
- Optional: Sentry for error tracking (nice-to-have; SOC 2 likes it)

---

## 4. Permissions matrix additions

The current matrix has `manager`, `instructor`, `viewer`. The agency layer adds:

| Role            | Scope      | Allowed to                                                                                                                                                                                                                                |
| --------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agency_admin`  | One agency | Create/manage client orgs in the agency. Configure agency branding + custom domain. Manage billing + view all client-org rollups. Cannot bypass org RLS — must still be a `manager` of a specific client org to access its data directly. |
| `agency_member` | One agency | Read-only on agency dashboard (rollup analytics, billing snapshot). Used for finance/ops staff who shouldn't change settings.                                                                                                             |

### Cross-tier access semantics

- An `agency_admin` is **not automatically** a manager of every client org. They have to be invited explicitly to a client org if they need to operate in it. (Cleanest auditability: agency admin actions vs manager actions are clearly separated in audit_log.)
- An `agency_admin` CAN: see the list of client orgs in their agency, see seat count + billing per client, switch into a client org as a manager IF they have a manager membership there.
- An `agency_admin` CANNOT: read TRA details, project tasks, or any tenant data of a client org without an explicit manager membership.

This deliberate separation is what keeps the multi-tenant trust story clean.

---

## 5. Phasing — 9 phases, value-ordered

Phases are sequenced by customer-facing value and dependency order. Each phase is one PR or PR sequence; each is independently shippable + rollback-safe.

### Phase 1 — Agency tier foundation (3 sessions)

Foundational. Every other phase depends on this.

- Migrations: `agencies`, `agency_memberships`, `organizations.agency_id` FK, helper SQL functions
- Existing orgs default to `agency_id = NULL` (standalone — preserves current behavior)
- App: `getCurrentAgencyId()`, `isAgencyAdmin()`, `requireAgencyAdmin()` helpers
- App: `/agency` dashboard route — list of client orgs in the agency, basic seat count, switch-into-org links
- App: agency switcher in the top nav (similar to the existing org switcher) — only renders when user is in an agency
- Server actions: `createClientOrg` (agency_admin only) — provisions a new org under the agency, optionally seeds with a workspace preset
- Audit log: every agency-level action writes a row with the new `agency_id` populated

**Acceptance**: a manually-provisioned agency_admin can sign in, see a `/agency` dashboard, create a new client org, see it in the list, switch into it (becomes manager of that org).

### Phase 2 — Agency-level branding (2 sessions)

- Migration: `agencies` gets `logo_url`, `favicon_url`, `primary_color`, `secondary_color`, `accent_color`, `email_from_name`, `email_from_address`
- Server-side: `getCurrentBrand()` helper — returns agency branding when in an agency context, falls back to Arbor defaults
- Layout: branding context provider injects CSS custom properties (`--brand-primary`, etc.) at the top of `<html>`
- Login page: when accessed via a custom domain, reads the agency from hostname and shows agency branding (logo + colors) — Arbor name nowhere in sight
- Email templates: accept `brand` context (logo URL + primary color + from-address) and render with agency branding
- New page: `/agency/branding` — agency-admin form to upload logo, pick colors, set email from-address
- Logo storage: Supabase Storage bucket `agency-branding` with RLS (agency_admin can write own; everyone reads)
- Favicon swap: Next.js metadata API + dynamic icon route based on hostname → agency lookup

**Acceptance**: agency_admin can upload a logo + set colors. Login page shown to a user whose URL matches the agency's custom domain (or whose org is under that agency) shows the agency's branding. Invitation emails sent for an org under that agency use the agency's from-address + colors.

### Phase 3 — Custom domains (BYOD) (2 sessions)

- Migration: `agencies.custom_domain text unique`, `agencies.custom_domain_verified_at timestamptz`
- App: `/agency/domain` — agency-admin UI: enter domain, see DNS instructions (CNAME to vercel-dns.com or A record), check verification status, request cert
- Server action: `verifyAgencyDomain` — calls Vercel Domains API to add domain to project + initiates verification
- Middleware: `apps/web/src/middleware.ts` reads `host` header → if matches `agencies.custom_domain` → sets `x-agency-id` request header (consumed by layouts to scope branding + auth)
- Login page: when on a custom domain, the page is dedicated to that agency's tenants (no org switcher to other agencies)
- DNS verification: TXT record fallback if CNAME isn't possible (Vercel supports both)
- Cert provisioning: automatic via Vercel; document the manual cert option for advanced cases
- Apex domain (no www) supported via Vercel A record
- Edge case: domain ownership conflict (two agencies claim same domain) → unique constraint + clear error message

**Acceptance**: agency_admin enters `app.testfirm.com`, follows DNS instructions, hits a verify button, gets a green check. Visiting `app.testfirm.com/login` shows the agency's branding + login form. Sign-in works end-to-end.

### Phase 4 — SSO per client org (3 sessions)

This is the largest phase. Two implementation paths to choose from at the start:

**Option A: Supabase native SAML** (Free with Supabase Pro plan; limited to SAML 2.0)
**Option B: WorkOS as SSO provider** (~$125/mo per connection; supports SAML + OIDC + SCIM; better dev UX)

**Recommendation**: Option A first; migrate to WorkOS if customers require OIDC-only IdPs or SCIM. Decision can be revisited at the start of Phase 4.

#### 4a — SAML configuration UI (1.5 sessions)

- Migration: `sso_configs` table per org
- App: `/admin/settings/sso` (manager-gated) — SAML metadata XML upload, attribute mapping (email → email, name → full_name), enable toggle
- Supabase Auth admin API integration to register the SSO config
- Test mode: "Test SAML login" button that walks the round-trip without modifying the user

#### 4b — SSO login flow (1 session)

- Login page enhancement: email-first input → if email domain matches an org's SSO config → SSO redirect; else password/magic-link
- Server-side discovery: `lookupSsoForEmail(email)` — returns SSO config if email's domain matches a registered org's domain
- Just-in-time user provisioning: SAML response creates auth.users + org_membership row if email matches an invitation OR matches an org's allowed-domain whitelist
- Audit log: SSO login events logged with `event_type = 'sso_login'`

#### 4c — SCIM provisioning (deferred to Phase 4d if needed)

Most customers can live without SCIM initially. WorkOS provides this if Phase 4 migrates to WorkOS.

**Acceptance**: a hospital admin uploads their AzureAD SAML metadata, enables SSO. A user from that hospital signs in via SAML, lands authenticated, sees their org content per their existing membership. No password ever entered.

### Phase 5 — Manual billing + invoice records + PDF generation (2 sessions)

**No Stripe.** Arbor (you) bills agencies manually. The platform records everything (contracts, monthly rev share, invoices, payments) and produces professional invoice PDFs you download + email + chase collections on yourself.

Why manual: avoids $600+/yr Stripe fees, removes a vendor + integration to maintain, sufficient for low-volume early-stage agency partnerships. **Forward-compatible**: `arbor_invoices.payment_provider` defaults to `'manual'` and could become `'stripe'` later without restructuring.

What ships:

- Migration `client_contracts` table: agency_id, org_id (the client), pricing_tier (small/medium/large/enterprise), annual_contract_value_cents, revenue_share_pct, contract_start, contract_end, status (trial/active/expired/cancelled), notes
- Migration `arbor_invoices` table: id, invoice_number (sequential `ARB-YYYY-NNNNN`), agency_id, period_start, period_end, issued_at, due_at, total_cents, status (draft/sent/paid/overdue/void/cancelled), payment_provider (default `manual`), paid_at, paid_method (check/wire/ach/other), paid_reference (check #, wire confirmation, etc.), line_items jsonb (snapshot of contracts billed in this period), notes
- Migration `agencies` columns: billing_email, billing_address, payment_terms_days (default 30)
- Server actions:
  - `createClientContract` (agency_admin): record a new agency-client deal
  - `updateClientContract` / `cancelClientContract`
  - `generateInvoiceNow` (Arbor admin only — see below): manually trigger invoice generation for a single agency outside the monthly cron
  - `markInvoicePaid` (Arbor admin only): record payment metadata
  - `markInvoiceVoid` (Arbor admin only): for cancellations or corrections
- App `/agency/clients` (agency_admin only): record + edit client contracts; see current rev-share-owed for the period
- App `/agency/billing` (agency_admin only): current period's accumulated rev share (live calculation), invoice history, payment status. Read-only — agency_admins see what they owe but can't create/modify invoices themselves.
- App `/agency/billing/[invoiceId]` — single invoice view with full line items
- API route `/api/agency/invoices/[id]/pdf` — generates invoice PDF using existing pdf-lib pattern from TRA route. Includes Arbor branding, agency bill-to details, line items, payment instructions, due date, invoice number.
- Cron (Supabase Edge Function or scheduled SQL, runs 1st of each month at 09:00 UTC): for each agency, sums rev share owed across all `status='active'` client_contracts for the prior month → creates `arbor_invoices` row with status='draft' → notifies you (Arbor) via email
- "Mark as paid" flow: you receive payment outside the platform → log in to Arbor admin → click invoice → fill in payment date + method + reference → status flips to 'paid' + audit_log entry written
- Tier auto-recalculation: same as before — monthly cron flags contracts whose active user count crossed a tier boundary; emits a notification (does not auto-upgrade)
- Trial period: `client_contracts.status='trial'` skipped in invoice generation. First contract per agency defaults to 90-day trial; configurable.

**Decisions baked into v1** (push back if any are wrong):

- Invoice numbering: sequential `ARB-YYYY-NNNNN` across all agencies (e.g. `ARB-2026-00001`). Audit-friendly + simple.
- Payment terms: Net 30 default, per-agency override.
- Arbor billing entity (your name, address, payment instructions): configured via `ARBOR_BILLING_*` env vars rendered into every PDF + email.
- No automated email sending in v1: you download PDF + email manually. (Optional Phase 5b: send-invoice action that emails the PDF via Resend.)

**Where Arbor admin powers live**: `markInvoicePaid` and `generateInvoiceNow` are NOT agency_admin operations — they're Arbor-internal. v1 implementation: gate by an `ARBOR_ADMIN_USER_IDS` env var (comma-separated user UUIDs). A proper Arbor admin role + console can land in v2.

**Acceptance**: agency_admin records a $50k Medium-tier contract for Hospital X. On the 1st of next month, an invoice for $1,250 ($50k × 30% ÷ 12) is auto-created with status='draft' and you receive a notification. You review, click the invoice, download the PDF, email it to the agency. Two weeks later they Zelle you $1,250. You log in, click the invoice, click "Mark paid", enter date + method='zelle' + reference='confirmation #'. Status flips to 'paid'. Audit log captures everything.

### Phase 6 — Public REST API + webhooks (3 sessions)

#### 6a — API keys + auth (1 session)

- Migration: `api_keys` table per org (NOT per agency — keeps blast radius small)
- App: `/admin/settings/api` (manager-gated) — generate API key, name it, set scopes, revoke
- Key format: `arbor_<env>_<32-random>` (env = test|live)
- Storage: only hash (bcrypt) stored in DB; full key shown once on creation
- Auth middleware: `/api/v1/*` routes accept `Authorization: Bearer <key>` header, look up by hash, set request scope to that org

#### 6b — REST endpoints (1.5 sessions)

- Subset of resources for v1: instructors, classes, projects, tasks, tras, allocations
- Standard verbs: GET list, GET single, POST create, PATCH update, DELETE
- All endpoints scoped to the API key's org
- OpenAPI 3.1 spec generated from route handlers
- Rate limiting: per-key, 100 requests/minute (free tier), 1000/min (Enterprise)
- Pagination: cursor-based; `?limit=50&cursor=<opaque>`
- Errors: standard problem-details format (RFC 7807)

#### 6c — Outbound webhooks (0.5 sessions)

- Migration: `webhook_endpoints`, `webhook_deliveries`
- App: `/admin/settings/webhooks` — register endpoint URL, pick events, regenerate signing secret
- Event emitter: server actions emit events to a queue (Supabase pg_notify or a simple table); a background worker picks up + posts to registered endpoints
- Signed payloads: HMAC SHA-256 with the endpoint's secret; signature in `X-Arbor-Signature` header
- Retries: 5 attempts with exponential backoff; failed deliveries logged
- Replay UI: admin can re-send any past delivery from the dashboard

**Acceptance**: developer at a consulting firm generates an API key, calls `GET /api/v1/tras?org_id=...`, gets JSON; registers a webhook for `tra.created`; creates a TRA in the UI; webhook fires within seconds; signature verifies.

### Phase 7 — SOC 2 Type II controls (engineering side; ~3 sessions of code work spread across 6+ months) (3 sessions)

The audit itself is paperwork + observed-behavior over time. Engineering work to support it:

- **Encryption at rest**: confirm Supabase managed encryption is enabled (default; verify); confirm Vercel encrypts envs (default)
- **Backups**: enable Supabase point-in-time recovery (Pro plan feature); document RTO/RPO; quarterly restore drill
- **Access controls**: implement IP allowlisting on Supabase admin (production); MFA required for all human access to prod
- **Audit logging**: already in place (audit_log table); add log retention policy (5 years recommended); add anomaly detection (e.g. alert on `DENIED` spikes)
- **Vulnerability management**: enable GitHub Dependabot (free); SLA for high/critical CVEs documented in Drata
- **Vendor**: **Drata** (locked). ~$15K/year subscription + ~$15K-$25K partner auditor (Sensiba, Prescient, or A-LIGN). Total ~$30K-$40K for first Type II report. ~6 months elapsed from Drata onboarding → report-in-hand. Drata auto-collects evidence from Vercel + Supabase + GitHub via official integrations.
- **Incident response**: write runbook (`docs/runbooks/incident-response.md`); conduct quarterly tabletop exercise
- **Change management**: require PR review for all prod changes; automated test coverage gates
- **Vendor management**: maintain `docs/vendors.md` listing every subprocessor (Supabase, Vercel, Resend, Stripe, etc.) with their compliance posture
- **Access reviews**: quarterly review of who has prod access; document
- **Data retention**: configurable per-org retention for audit_log, soft-deleted records; document defaults

Pick a SOC 2 vendor (Vanta, Drata, or Secureframe) — they automate evidence collection. Recommended: **Drata** (better dev UX) or **Vanta** (more mature in healthcare). Cost: ~$10K-$20K/year.

**Acceptance**: SOC 2 Type II report obtained from auditor. Posted on a `https://trust.arbor.app` page (gated behind login).

### Phase 8 — Data export + GDPR/HIPAA mechanics (1.5 sessions)

- App: `/admin/data-export` — button "Export all org data" → triggers background job → emails ZIP link when ready
- Background worker: query every tenant table for the org, generate CSVs, ZIP them, upload to time-limited Supabase Storage URL
- Hard-delete-org workflow: `/admin/danger-zone/delete-org` — typed confirmation, requires re-auth, schedules deletion 7 days out (cancellable in that window), then runs `DELETE FROM organizations WHERE id = ?` (cascades clean up tenant data; audit_log entries with this org_id are retained)
- Per-org data retention setting: `organizations.data_retention_days` (default 1825 = 5 years); cron job purges audit_log entries older than retention
- HIPAA-specific: BAA template (Arbor as Business Associate); document where PHI may live (TRA fields could contain it; education_request fields too); add `is_phi` flag to relevant tables for retention policy enforcement

**Acceptance**: org admin clicks export, receives email with ZIP within 5 minutes, ZIP contains every record across every tenant table for that org. Hard-delete works end-to-end with the 7-day grace window.

### Phase 9 — Self-serve agency onboarding + sales infrastructure (2 sessions)

- New route: `/signup-agency` — agency self-service registration (separate from existing user invite flow)
- Wizard: agency name + slug → admin user account → 14-day Pro trial activated
- Agency creation server action provisions: agency row + agency_admin membership + first client org (optional, with sample data) + Stripe trial subscription
- New route: `/pricing` — public pricing page; CTA → /signup-agency
- New route: `/trust` — security overview, SOC 2 report download (gated)
- New route: `/changelog` — public release notes
- Demo environment: a perpetually-reset agency at `demo.arbor.app` with sample client orgs (one hospital training, one EMR analyst, one consulting firm) — auto-resets nightly
- Status page: integrate Statuspage.io or roll a simple one with Supabase + Vercel uptime data

**Acceptance**: new agency can self-register, complete a wizard, land on their `/agency` dashboard within 2 minutes. Pricing page renders all tiers + signup CTA.

---

## 6. Permission boundaries summary

After all phases:

| Layer               | Tables                                            | Enforced by                                                                                                                                |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Agency              | `agencies`, `agency_memberships`, `subscriptions` | RLS: agency_admin sees own agency only                                                                                                     |
| Org (within agency) | `organizations`, all tenant tables                | RLS: existing manager/instructor/viewer scope (Phase 4 of permissions plan) + agency_admin can SELECT (not write) all orgs in their agency |
| User (within org)   | per-table                                         | RLS: existing per-domain predicates                                                                                                        |
| API                 | `api_keys` scoped to one org                      | API middleware + Postgres RLS via `request.api_key.org_id` setting                                                                         |

---

## 7. File-level changes (anchor list, abbreviated)

### Migrations

- `supabase/migrations/<phase1>_agency_tier.sql`
- `supabase/migrations/<phase2>_agency_branding.sql`
- `supabase/migrations/<phase3>_custom_domains.sql`
- `supabase/migrations/<phase4>_sso_configs.sql`
- `supabase/migrations/<phase5>_client_contracts_and_invoices.sql`
- `supabase/migrations/<phase6>_api_webhooks.sql`
- `supabase/migrations/<phase8>_data_retention.sql`

### App routes (new)

- `apps/web/src/app/agency/*` — agency console (dashboard, branding, domain, billing, settings)
- `apps/web/src/app/(authenticated)/admin/settings/sso/*` — per-org SSO config
- `apps/web/src/app/(authenticated)/admin/settings/api/*` — API keys
- `apps/web/src/app/(authenticated)/admin/settings/webhooks/*` — webhook endpoints
- `apps/web/src/app/(authenticated)/admin/data-export/*`
- `apps/web/src/app/(authenticated)/admin/danger-zone/*`
- `apps/web/src/app/api/v1/[...path]/route.ts` — REST API
- `apps/web/src/app/api/stripe/webhook/route.ts` — Stripe webhook handler
- `apps/web/src/app/signup-agency/*` — agency self-service signup
- `apps/web/src/app/pricing/*`, `apps/web/src/app/trust/*`, `apps/web/src/app/changelog/*`

### Middleware + helpers

- `apps/web/src/middleware.ts` — hostname routing, agency context
- `apps/web/src/lib/auth/agency.ts` — agency role helpers
- `apps/web/src/lib/billing/*` — Stripe + metering
- `apps/web/src/lib/api/*` — API key auth, OpenAPI spec
- `apps/web/src/lib/webhooks/*` — outbound webhook emitter

### Background jobs (Supabase Edge Functions or scheduled SQL)

- Monthly Arbor invoice generation (1st of month) — sums rev share owed across each agency's active client_contracts → creates Stripe invoice
- Tier auto-recalculation (monthly) — flags client_contracts whose active user count crossed a tier boundary
- Webhook delivery worker
- Audit log retention purge
- Demo environment reset

### Documentation

- `docs/api/openapi.yaml` — generated
- `docs/runbooks/*` — incident response, restore drill, etc.
- `docs/vendors.md` — subprocessors
- `SECURITY.md` (root) — already exists; updated for agency tier

---

## 8. Acceptance criteria (per-phase + final)

Each phase has a per-phase acceptance check above. Final acceptance for "we can sell this to a consulting firm":

- [ ] Agency self-serve signup works end-to-end (Phase 9)
- [ ] Agency can create + manage client orgs (Phase 1)
- [ ] Agency can set logo + colors that flow through every page including login + emails (Phase 2)
- [ ] Agency can set custom domain that resolves with auto-provisioned cert (Phase 3)
- [ ] Each client org can configure SAML SSO and end-users authenticate via their IdP (Phase 4)
- [ ] Agency receives monthly Stripe invoice based on seat count; tier gates work (Phase 5)
- [ ] Customer developers can use REST API + webhooks to integrate (Phase 6)
- [ ] SOC 2 Type II report obtained and posted (Phase 7) — long lead time
- [ ] Data export + hard-delete + retention policies work (Phase 8)
- [ ] Hospital training golden path E2E still passes (regression)
- [ ] Three-role permission boundaries unchanged (regression)

---

## 9. Rollback plan

| Phase              | Rollback action                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 (Agency tier)    | Drop `agencies`, `agency_memberships` tables; drop `organizations.agency_id` column. All existing orgs unaffected (they had `agency_id = NULL`). |
| 2 (Branding)       | Drop new columns on agencies; revert layout to hardcoded brand.                                                                                  |
| 3 (Custom domains) | Drop `custom_domain` columns; remove Vercel domains via API; users revert to `app.arbor.app`.                                                    |
| 4 (SSO)            | Drop `sso_configs`; users fall back to email/password/magic-link.                                                                                |
| 5 (Billing)        | Pause monthly invoice cron; existing Stripe invoices remain (no auto-refund). client_contracts table retained for forensic + reactivation value. |
| 6 (API/webhooks)   | Disable `/api/v1/*` routes; in-flight webhook deliveries finish; tables retained for forensic value.                                             |
| 7 (SOC 2)          | Audit-related code is mostly additive (logging, alerts); no rollback needed.                                                                     |
| 8 (Data export)    | Disable export route; retention purge cron stays (it's safe).                                                                                    |
| 9 (Onboarding)     | Disable `/signup-agency`; existing agencies unaffected.                                                                                          |

Every phase ships with a `down.sql` for migrations.

---

## 10. Out of scope (v1 — explicitly deferred to v2)

- **Per-client-org branding** (overriding agency brand). v1 is agency-only.
- **Three-tier hierarchy** (Agency → Brand → Client). v1 is two-tier.
- **GraphQL API**. REST + webhooks only in v1.
- **Agency-level SSO** (one IdP for the whole agency, not per client org). v1 is per-client-org SSO only.
- **Native mobile apps**. Responsive web is the surface.
- **i18n / multi-language**. English only.
- **Direct hospital-to-Arbor billing** (Stripe Connect / marketplace). v1 is consultant-collects-from-hospital-pays-Arbor only.
- **Feature tiering** (Starter/Pro/Enterprise feature gates). EXPLICITLY DROPPED — every customer gets every feature; pricing varies by team-size tier only.
- **Per-seat metering**. v1 uses annual flat tier per client_contract.
- **Marketplace / template store**. v1 ships the workspace presets we already built; no template upload by users.
- **Custom field types per intake**. v1 ships fixed field shapes.
- **EU data residency**. v1 is US-only; EU added later via separate Supabase project.
- **HIPAA full compliance** (BAA-eligible). v1 ships SOC 2 baseline; HIPAA in Phase 7b.
- **SCIM user provisioning**. v1 SSO is JIT (just-in-time) provisioning; SCIM in Phase 4d if customer demand.
- **Dedicated single-tenant deployments**. All customers on shared multi-tenant infrastructure in v1.

---

## 11. Phasing dependencies + parallel tracks

```
Phase 1 (agency tier)
  └─ Phase 2 (branding) ─┐
  └─ Phase 3 (domains)   ├─ Phase 9 (onboarding) — needs branding + domains
  └─ Phase 4 (SSO)       │
  └─ Phase 5 (billing) ──┘
                          └─ Phase 6 (API)
Phase 7 (SOC 2) — runs in parallel with everything; ~6 month elapsed
Phase 8 (data export) — independent; can land any time after Phase 1
```

**Recommended execution order**:

1. Phase 1 (foundation, blocks everything)
2. Phase 5 (billing — generates revenue, no point shipping features without billing)
3. Phase 2 (branding — customer-facing wow)
4. Phase 3 (domains — customer-facing wow)
5. Phase 8 (data export — required for any enterprise deal)
6. Phase 4 (SSO — required for hospital sales)
7. Phase 6 (API — important but later customers tolerate "API in next quarter")
8. Phase 9 (self-serve onboarding — once we have a working product to sell)
9. Phase 7 (SOC 2 — paperwork running in parallel since Phase 1)

---

## 12. Key risks + mitigations

| Risk                                            | Impact                         | Mitigation                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom domain provisioning fails for a customer | Stuck onboarding               | Document manual cert path; have on-call rotation; Vercel support has SLA on Pro plan                                                                                                                                |
| Stripe webhook drops an event                   | Subscription state drifts      | Idempotent processing via `stripe_event_id`; nightly reconciliation cron compares Stripe state to DB                                                                                                                |
| SOC 2 audit fails first attempt                 | 3-6 month delay                | Use Vanta/Drata to pre-validate before audit; conduct internal mock audit first                                                                                                                                     |
| Consultant underreports contract value          | Arbor under-collects rev share | Quarterly true-up: agency_admin certifies the year's contract values in writing; auditable signature recorded in audit_log. Plus: cross-check active user count → suggested tier; flag mismatches for human review. |
| Agency goes bankrupt with active clients        | Orphaned client orgs           | Contractual: agency must give 30-day notice; if not, Arbor takes over billing direct-to-client temporarily                                                                                                          |
| RLS misconfiguration leaks data across agencies | Catastrophic trust failure     | Comprehensive pgTAP suite (extends today's): every (role × op × table) tested; agency_admin tested for cross-agency isolation specifically                                                                          |
| Hospital IdP returns unexpected SAML attributes | SSO broken for that customer   | Customer-specific attribute mapping in `sso_configs.attribute_mapping`; test SAML round-trip required before enabling                                                                                               |
| Trial-to-paid conversion <expected              | Burn extends                   | Track conversion in onboarding; A/B test pricing; outbound CSM motion for trials at day 7                                                                                                                           |

---

## 13. Open items requiring decision before kickoff

1. **Revenue share %** — recommendation: 30% to Arbor / 70% to consultant. Standard B2B reseller channel split. Confirm before Phase 5 ships.
2. **Tier price points** — recommendation: $30k Small / $50k Medium / $75k Large retail. These are sticker prices the consultant uses with hospitals; the consultant can negotiate down. Arbor's share = `actual_contract_value × 30%`. Confirm before launching.
3. **90-day rev-share onramp for first 10 agencies** — recommendation: zero up-front, first contract per agency is the trial period; flip to standard 30/70 after. Confirm before launching agency program.
4. **SOC 2 vendor** — ✅ LOCKED: **Drata**. Better engineering UX, $10-15K vs $15-25K for Vanta, official Supabase integration cuts manual evidence work by ~40%, and we're not at the scale where Vanta's healthcare brand recognition matters yet. Total all-in for first SOC 2 Type II: ~$30K-$40K (Drata + partner auditor) over ~6 months from kickoff. Switch to Vanta later only if a major hospital deal specifically requires it.
5. **SSO implementation** — Supabase native SAML vs WorkOS. Recommendation: Supabase first; switch to WorkOS if customers require OIDC or SCIM. Confirm at Phase 4 start.
6. **Demo environment auto-reset cadence** — nightly vs weekly. Recommendation: nightly for fresh demos; weekly is fine if the env is stable.

---

## 14. Estimated total effort

| Item                                                        | Effort                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| Phase 1: Agency tier                                        | 3 sessions                                              |
| Phase 2: Branding                                           | 2 sessions                                              |
| Phase 3: Custom domains                                     | 2 sessions                                              |
| Phase 4: SSO per client                                     | 3 sessions                                              |
| Phase 5: Billing (rev share, no feature gates, no metering) | 1.5 sessions                                            |
| Phase 6: REST API + webhooks                                | 3 sessions                                              |
| Phase 7: SOC 2 controls                                     | 3 sessions (engineering; audit takes 6+ months elapsed) |
| Phase 8: Data export + retention                            | 1.5 sessions                                            |
| Phase 9: Self-serve onboarding                              | 2 sessions                                              |
| **Engineering total**                                       | **~20.5 sessions = 9–11 weeks**                         |
| **SOC 2 audit elapsed**                                     | **6–12 months running in parallel**                     |
| **First reseller customer realistic**                       | **3–4 months from start (without SOC 2)**               |
| **First enterprise reseller customer**                      | **9–12 months from start (with SOC 2)**                 |

---

## 15. Execution sequence (when approved)

1. Update `MEMORY.md` with pointer to this doc + status
2. Confirm the 6 open items in §13 (most can wait until their phase)
3. Begin **Phase 1**: agency tier foundation
4. After each phase: `pnpm build`, run pgTAP, run vitest, run e2e (including hospital training golden path), push, regenerate types, commit + tag
5. From Phase 5 onward: Stripe test mode for development; production Stripe keys gated to deploy preview workflow
6. SOC 2 vendor onboarding starts in parallel with Phase 1 (long lead time on evidence collection)
