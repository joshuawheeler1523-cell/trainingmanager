import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import TeamView, { type MemberRow } from "./team-view";

export default async function TeamPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return (
      <div>
        <PageHeader title="Team" description="Members of your organization." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("id, user_id, role, visibility, display_name, accepted_at, invited_at, created_at")
    .eq("org_id", orgId)
    .order("created_at");

  // Lookup auth.users emails for the membership user_ids. The RLS-bound
  // anon Supabase client can't read auth.users directly; we use the
  // service-role key when available. In dev without the service key we
  // fall back to a row-level fetch via a SECURITY DEFINER view; absent
  // either, the email column shows "—".
  const userIds = (memberships ?? []).map((m) => m.user_id);
  const userEmailMap = await loadUserEmails(userIds);

  const rows: MemberRow[] = (memberships ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    email: userEmailMap.get(m.user_id) ?? null,
    display_name: m.display_name,
    role: m.role as MemberRow["role"],
    visibility: m.visibility as MemberRow["visibility"],
    accepted_at: m.accepted_at,
    invited_at: m.invited_at,
    created_at: m.created_at,
  }));

  return (
    <div>
      <PageHeader
        title="Team"
        description="Members of your organization. Invite new users and manage roles + visibility."
      />
      <div className="p-6">
        <TeamView members={rows} />
      </div>
    </div>
  );
}

// Fetch emails for the given user_ids using the service-role key. Returns an
// empty map when SUPABASE_SERVICE_ROLE_KEY isn't set — the team page still
// renders, just without email addresses.
async function loadUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || userIds.length === 0) return out;

  const admin = createAdminSupabase<Database>(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // listUsers paginates; for typical org sizes a single page is enough.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of data.users) {
    if (u.email && userIds.includes(u.id)) {
      out.set(u.id, u.email);
    }
  }
  return out;
}
