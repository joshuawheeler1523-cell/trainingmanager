# Quarterly restore drill

SOC 2 control: backups must be tested. Untested backups are not backups.

## Cadence

Run once per quarter. Calendar invite owner: Joshua. Drill block: 90 minutes.

## Procedure

1. **Pick a scratch project.** Create a new Supabase project (or reuse
   the existing `arbor-restore-drill` project).
2. **Restore PITR snapshot.** In the production project's Database tab,
   choose Point-in-Time Recovery → restore to a target timestamp ~2 hours
   ago into the scratch project. Record the start time.
3. **Verify integrity.** Once the restore completes, run:
   ```sql
   select count(*) from organizations;
   select count(*) from audit_log;
   select max(created_at) from audit_log;
   ```
   Compare to expected values from production at the snapshot time.
4. **Spot check tenant data.** Pick one org by id and verify a few rows
   in tras / classes / instructors match what production had at the
   snapshot time.
5. **Record results.** In `docs/runbooks/restore-drill-log.md`:
   - Drill date
   - Snapshot target time
   - Time to first byte restored
   - Time to verified-complete
   - Anomalies (if any)
6. **Tear down.** Pause the scratch project to avoid Supabase compute
   charges. Do not delete — the drill log entry references it.

## Recovery objectives

These are the targets we evidence to the SOC 2 auditor:

- **RTO (Recovery Time Objective):** 4 hours from detection to user-visible recovery.
- **RPO (Recovery Point Objective):** 5 minutes (Supabase PITR granularity).

If a drill exceeds RTO, file a P1 ticket to investigate before the next quarter's drill.
