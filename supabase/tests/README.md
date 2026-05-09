# pgTAP tests

Postgres-side test suite for the role + RLS model.

## Run

Requires Docker + the local Supabase stack.

```bash
supabase start          # boots local Postgres + auth + studio
supabase test db        # runs every supabase/tests/*.sql file
```

Each test file:

- Begins with `begin;` and ends with `rollback;` so test fixtures don't pollute the dev DB.
- Calls `select plan(N)` up front and `select * from finish()` at the end.
- Uses [pgTAP](https://pgtap.org) assertions: `ok`, `is`, `isnt`, `lives_ok`, `throws_ok`, `results_eq`, `isnt_empty`.

## Files

| File                           | Coverage                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role_helpers.test.sql`        | `is_manager` / `is_instructor` / `is_viewer` / `has_any_role` / `current_instructor_id` / `user_role_in_org` for each role + anon                                                         |
| `rls_role_boundaries.test.sql` | Representative RLS behavior: viewer SELECT-only, instructor cannot INSERT into manager-only tables, instructor can self-edit own row, column ACL trigger blocks unauthorized column edits |

## Adding tests

Use `supabase test new <name>` to scaffold, or copy an existing file. Keep each file scoped to one concern; pgTAP runs them independently.

The two sample files install fixture users + memberships using deterministic UUIDs (`cccccccc-1111-1111-1111-...` and `cccccccc-2222-2222-2222-...`). The `tests.set_auth_user(uuid)` helper sets `request.jwt.claim.sub` to switch the active user inside a test transaction. Combined with `set local role authenticated`, this makes RLS evaluate as that user.

## Coverage gaps (todo)

- Per-table verification for every (role × operation × table) intersection — currently only sampled. The full matrix is documented in [SECURITY.md](../../SECURITY.md) and enforced by Phase 3 + 4 RLS migrations.
- Audit denial logging path (manager-gated server action denial inserts a row to `audit_log`). That's app-layer behavior tested in vitest, not pgTAP.
- Public anon paths (share tokens, intake links). Currently exercised by the existing migration scenario tests in `packages/db`.
