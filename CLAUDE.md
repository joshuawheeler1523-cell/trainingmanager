@AGENTS.md

# Arbor — Claude session bootstrap

Read this before doing anything in this repo. It captures everything that's bitten me in past sessions and the context that makes work efficient.

## What this is

**Arbor** is a capacity / project management platform for hospital training departments. Built by Joshua Wheeler (Raised Beef AI). Currently white-label-resellable through consulting agencies (30/70 rev share to Arbor).

Three tenant tiers:

- **Standalone orgs** — single hospital using Arbor directly
- **Agency-managed orgs** — hospitals provisioned by a reseller agency
- **Agencies** — consulting firms that resell Arbor under their own brand + domain

Three role layers: `manager` / `instructor` / `viewer` inside each org; `agency_admin` / `agency_member` inside each agency; `arbor_admin` (env-allowlisted) for the platform owner.

## Where to look

- **Build plans** at `docs/build-plans/<date>_<topic>.md` — canonical specs for every multi-phase build (white-label, super-admin, etc.). Read the relevant one before assuming what should exist.
- **Runbooks** at `docs/runbooks/` — incident response, restore drill, access reviews.
- **Test plans** at `docs/test-plans/` — manual smoke tests for shipped features.
- **Migrations** at `supabase/migrations/` — chronological, never edit historical ones.
- **Memory** at `~/.claude/projects/C--Users-joshu-Documents-my-arbor/memory/` — prior-session learnings and user preferences. Skim `MEMORY.md` for index.

## Tech stack quirks

### Next.js 16 with Turbopack

- **Use `proxy.ts`, NOT `middleware.ts`.** Next.js 16 renamed it. Both files in the same project is a hard build error. Existing file is at `apps/web/src/proxy.ts` exporting `async function proxy(request: NextRequest)`. Add request-time logic there.
- **No `.js` extensions in TS source for shared packages.** Turbopack chokes. Use `import { x } from "@arbor/shared"` not `from "@arbor/shared/index.js"`.
- **Server actions only fail at build time, not lint/typecheck.** Always run `pnpm --filter web build` before declaring something done.
- **Authenticated pages live in the `(authenticated)` route group.** Public pages (landing, pricing, /legal, /trust, /status, /agency-signup) live at the root. The dashboard moved from `/` to `/dashboard` — see `proxy.ts` for the redirect rules.

### Supabase

- **Every tenant table has RLS.** When adding a new table, enable RLS + write policies + remember `is_manager(org_id)` / `is_agency_admin(agency_id)` helpers exist already.
- **`audit_log.org_id` is NOT NULL.** For Arbor-admin events that don't have a clean tenant context, the convention is to use the agency*id (or user_id) as a surrogate. See existing `ARBOR_ADMIN*\*` audit entries for the pattern.
- **Regenerating types after migration:** `npx supabase gen types typescript --project-id bujwdmpyuglvpsvyejcm --schema public > types.tmp` then **strip the last line** (it appends a `<claude-code-hint />` tag that breaks tsc). Use `head -n -1 types.tmp > apps/web/src/lib/supabase/database.types.ts && rm types.tmp` then prettier-format.
- **Applying migrations:** the MCP tool runs read-only. Use `npx supabase db push --include-all` instead.
- **citext columns:** when referencing inside SECURITY DEFINER functions with `set search_path = ''`, the citext cast won't resolve. Use `lower(col::text) = lower(value)` instead.

### Code conventions

- **Server actions return `ActionResult<T>`** — discriminated union of `{ ok: true, data: T }` | `{ ok: false, error: { code, message, field? } }`. Never throw from a server action; always return the result.
- **Server-only modules** start with `import "server-only"`. Never import them from a client component.
- **Role gates:** `isManager(orgId)` for org-scoped, `isAgencyAdmin(agencyId)` for agency-scoped, `isArborAdmin()` for platform. All three are React.cache'd per-request.
- **No `<form action={serverAction}>` with imperative inner-call from a transition.** It hangs. The login form had this bug — wrap in try/catch + timeout if you must combine SSO discovery with the action call.
- **Heroicons not lucide-react.** lucide-react was removed (commit 7ac8afc7).

## Working defaults

### Pre-commit checklist

Before declaring anything done — even just a small fix:

1. `pnpm --filter web build` (catches server-action issues lint misses)
2. `pnpm --filter web lint` (max-warnings 0)
3. `pnpm --filter web test` (305+ tests; should all pass)

The pre-commit hook runs lint-staged (eslint --fix + prettier --write on staged files). It can rewrite formatting in your committed files; that's expected.

### Git conventions

- **Explicit deletions.** `rm` + `git add <other paths>` does NOT stage the deletion. Use `git rm -r <path>` or `git add -A <path>`. Cost me a 5-deploy-failure debugging session — see `feedback_git_rm_explicit.md` in memory.
- **Conventional commit prefixes.** `feat(scope):`, `fix(scope):`, `chore(scope):`, `docs(scope):`, `refactor(scope):`. Body explains the _why_; commit messages are read months later.
- **Co-author footer:** `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` — already convention.
- **Push immediately after commit** unless the user says otherwise. The user works in the deployed Vercel preview.

### When the user says "tackle them all" / "keep going" / "do it"

That's a directive to execute, not check in. Commit per logical phase, push after each. Don't ask "should I continue?" between phases — they'll tell you to stop.

### When the user asks an exploratory question

2-3 sentences with a recommendation and the main tradeoff. Present as redirectable. Don't implement until they agree.

## Things that bit me in past sessions

- Forgetting to revoke EXECUTE on SECURITY DEFINER functions → public RPC exposure. Always `revoke execute on function ... from public, anon, authenticated; grant ... to service_role;` after creating one (unless intentionally public, like the lookup RPCs).
- The supabase CLI types regen appends a stray hint tag — strip the last line.
- `git rm` not auto-staged via `git add` of other paths.
- `useActionState` action called imperatively from another transition — pending state can hang. The fix in `apps/web/src/app/login/login-form.tsx` (try/catch + timeout) is the pattern.
- Server actions hitting auth.users via `admin.auth.admin.listUsers({ perPage: 200 })` silently truncate past 200 users.
- Forgetting `'use server'` at the top of server-action files.

## What NOT to do

From the user's standing instructions:

- **Don't invent workflow gates.** Single-person workflows shouldn't have approve/reject/review steps gating action.
- **Never build time tracking.** Capacity planning only — no hour-by-hour logging, timesheets, billable hours.
- **Don't write planning, decision, or analysis documents** unless explicitly asked. Work from conversation context, not intermediate files.
- **Don't write README.md or other docs files** unless requested.
- **Don't add comments explaining WHAT.** Code already says what. Comment WHY when non-obvious.
- **Don't narrate internal deliberation.** End-of-turn summaries should be 1–2 sentences max.
- **Don't add fallbacks for impossible scenarios.** Trust internal code; validate at system boundaries only.

## Useful commands

```bash
# Build / lint / test
pnpm --filter web build
pnpm --filter web lint
pnpm --filter web test

# Apply pending migrations to prod Supabase
npx supabase db push --include-all

# Regenerate types (then strip the last line!)
npx supabase gen types typescript --project-id bujwdmpyuglvpsvyejcm --schema public > /tmp/types.ts
head -n -1 /tmp/types.ts > apps/web/src/lib/supabase/database.types.ts
npx prettier --write apps/web/src/lib/supabase/database.types.ts

# Vercel deploy state
# (use mcp__vercel__list_deployments + get_deployment_build_logs MCP tools)
```

## Env vars

Full list in `.env.example`. Critical ones for any session:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — for browser
- `SUPABASE_SERVICE_ROLE_KEY` — for admin operations (bypasses RLS)
- `ARBOR_ADMIN_USER_IDS` — comma-separated user IDs allowed into `/arbor/*`
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — outbound email; degrades gracefully when unset
- `ARBOR_LEGAL_*` + `ARBOR_BILLING_*` — surfaced in legal docs + invoice PDFs

## Currently open work

(Update this section when starting major builds; remove when done.)

- **Awaiting user testing:** White-label phases 1–9 + Arbor super-admin console + post-audit hardening + launch-blocker batch (marketing/pricing/health/auth flows/account/status/audit). All shipped to master, deployed to Vercel.
- **Deferred to v2:** customer impersonation, SOC 2 compliance dashboard, OpenAPI spec generation, TypeScript SDK for the API, Sentry wiring (abstraction lives at `apps/web/src/lib/observability.ts`).
