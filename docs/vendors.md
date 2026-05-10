# Subprocessor inventory

SOC 2 control: maintain a current list of every third party that processes
or stores customer data. Updated whenever a new vendor is added.

| Vendor                                   | Purpose                                           | Data accessed                                                             | Compliance posture                 | Contract                                    |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| **Supabase** (Vercel)                    | Postgres database, auth, storage, file uploads    | All tenant data, auth records, audit log, file blobs                      | SOC 2 Type II, HIPAA BAA available | Pro plan annual                             |
| **Vercel**                               | Application hosting, edge runtime, custom domains | Request metadata, runtime logs (no tenant data persisted)                 | SOC 2 Type II, HIPAA BAA available | Pro plan annual                             |
| **Resend**                               | Transactional email (invitations, notifications)  | Recipient email + message body                                            | SOC 2 Type II                      | Free tier (will upgrade for sending volume) |
| **Drata**                                | SOC 2 compliance automation, evidence collection  | Read-only access to Vercel, Supabase, GitHub for evidence collection only | SOC 2 Type II                      | Annual subscription                         |
| **GitHub**                               | Source code, CI/CD                                | Source code (no tenant data)                                              | SOC 2 Type II                      | Free / paid org                             |
| **Anthropic** (this Claude Code session) | Engineering productivity (no production access)   | None — local development only                                             | SOC 2 Type II                      | Pay-as-you-go                               |

## Adding a new subprocessor

1. Confirm the vendor has SOC 2 Type II OR ISO 27001 reports available
   under NDA. If neither, escalate — do not integrate.
2. Sign a DPA / BAA before any production data flows.
3. Add a row to this table with the same columns.
4. Update Drata's vendor inventory to keep evidence in sync.
5. Notify customers per their contract terms (typically 30 days before
   first data flow to a new subprocessor).

## Annual review

Once per year (anniversary of SOC 2 audit):

- Verify each vendor's compliance reports are still current
- Verify the BAA / DPA is signed and dated
- Confirm we still need each one — drop any that aren't load-bearing
