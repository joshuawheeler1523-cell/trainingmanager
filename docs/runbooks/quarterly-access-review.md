# Quarterly access review

SOC 2 CC6.1 control: who has prod access? Reviewed quarterly.

## Cadence

Q1, Q2, Q3, Q4 — week 1.

## Procedure

For each system below: list every account with elevated access, confirm
each is still needed, and revoke any that aren't.

### Supabase (production project)

```
Project Settings → Team → Members
```

Decision per member: Owner / Developer / Read-only / Remove.

### Vercel (Arbor project)

```
Team Settings → Members
```

Decision per member: Owner / Member / Viewer / Remove.

### GitHub (organization)

```
github.com/[org] → People
```

Decision per member: Owner / Member / Outside collaborator / Remove.

Confirm 2FA is enforced organization-wide.

### Anthropic / Drata / Resend dashboards

Spot-check active sessions; revoke any sessions that don't match a
current team member.

### Database direct access

```sql
select usename, valuntil from pg_user where usename != 'postgres';
```

Anyone who isn't on the team or hasn't logged in this quarter: drop.

### ARBOR_ADMIN_USER_IDS env var

This env var (production) controls who can mark invoices paid + run
manual invoice generation. Verify the listed UUIDs are current employees
or owners.

## Recording results

Append to `docs/runbooks/access-review-log.md`:

- Date of review
- Reviewer
- Number of accounts reviewed per system
- Accounts removed (with reason)
- Any anomalies (account belonging to someone who shouldn't have had access)
