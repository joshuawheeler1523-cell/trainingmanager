# Incident response runbook

This is the on-call playbook for security incidents (data breach, account
compromise, malicious actor) and availability incidents (Supabase outage,
Vercel outage, runaway bug taking down the app).

It is one of the controls evidenced for SOC 2 Type II.

## Severity matrix

| Sev    | Definition                                                                   | Response time     | Escalation                        |
| ------ | ---------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| **P0** | Data breach (any unauthorized access to tenant data) OR full platform outage | 15 min            | All hands; notify legal within 4h |
| **P1** | Auth broken, billing broken, or single-tenant outage                         | 1 hour            | Owner-on-call + one peer          |
| **P2** | Feature broken for some users                                                | 4 hours           | Owner-on-call                     |
| **P3** | Cosmetic / non-blocking                                                      | Next business day | Backlog                           |

## P0 — data breach response

1. **Contain first.** Revoke any compromised credentials immediately:
   - Supabase: rotate `service_role` key (Project Settings → API)
   - Vercel: rotate `VERCEL_API_TOKEN` if domain integration suspect
   - Resend: rotate `RESEND_API_KEY`
   - Compromised user: `auth.users` → reset password + revoke sessions
   - Compromised API key: `update api_keys set revoked_at = now() where ...`
2. **Snapshot evidence.** Before any cleanup:
   - `pg_dump --schema-only` of audit_log + the affected tenant tables
   - Copy relevant Vercel + Supabase logs to a private S3 bucket with
     timestamps
3. **Assess scope.** Query audit_log to determine which records the
   compromised actor touched:
   ```sql
   select operation, table_name, record_id, created_at
   from audit_log
   where actor_id = '<suspect uuid>'
   order by created_at desc;
   ```
4. **Notify.** Send breach notification per the tenant's contract terms
   (typically 72h for HIPAA-covered entities). Use the template in
   `docs/runbooks/breach-notification-template.md` once written.
5. **Postmortem.** Within 7 days: write-up in `docs/postmortems/` with
   timeline, root cause, contributing factors, action items.

## P0 — full platform outage

1. Check the Vercel + Supabase status pages; if either is down, post
   to status.arbor.app and stand by.
2. If our code: roll back the most recent deploy via Vercel ("Promote
   previous deployment"). This is one-click in the Vercel dashboard.
3. If a migration broke the DB: apply the rollback documented in the
   migration's header comment (every migration includes one).
4. Monitor the affected URLs for 30 min after recovery before standing
   down.

## P1 — auth broken

Symptoms: users can't log in, /login returns 500, magic-link emails not
arriving.

1. Check Resend dashboard — is the email domain still verified? Did the
   account hit a sending limit?
2. Check Supabase Auth logs (`get_logs` MCP tool) for 500s.
3. If SAML SSO is the culprit: temporarily disable the affected
   sso_configs row (`update sso_configs set enabled = false where ...`)
   so users fall back to magic link.

## P1 — billing broken

Symptoms: invoice generation failed, signed-URL downloads 500, /agency/
billing pages 500.

1. Check audit_log for the most recent successful invoice run.
2. If a specific contract is malformed, mark its status as 'expired' to
   exclude from the next run.
3. The cron is idempotent — once fixed, the next monthly run picks up
   any skipped agencies.

## Tabletop schedule

- Quarterly P0 tabletop (data breach simulation): Q1, Q2, Q3, Q4 weeks 4
- Annual P0 outage drill: rolling Vercel deploy + DB restore from PITR
  to a scratch project, time-to-recovery measured

## Contacts

- Owner-on-call: contact@raisedbeef.ai (primary)
- Vercel support: vercel.com/support (Pro plan)
- Supabase support: supabase.com/support (Pro plan)
- Drata support: support@drata.com
