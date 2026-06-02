import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Users" };

const PAGE_SIZE = 50;

export default async function ArborUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const admin = createAdminClient();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const { data: usersResp } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
  const users = usersResp.users;

  // Client-side filter by email substring (the GoTrue admin API doesn't
  // expose a search; for v1 we filter the page in-memory).
  const q = params.q?.toLowerCase() ?? "";
  const filtered = q ? users.filter((u) => (u.email ?? "").toLowerCase().includes(q)) : users;

  // Membership counts per user (parallel queries scoped to the visible page)
  const userIds = filtered.map((u) => u.id);
  const [{ data: orgMems }, { data: agencyMems }] =
    userIds.length > 0
      ? await Promise.all([
          admin.from("org_memberships").select("user_id").in("user_id", userIds),
          admin.from("agency_memberships").select("user_id").in("user_id", userIds),
        ])
      : [{ data: [] }, { data: [] }];

  const memCount = new Map<string, number>();
  for (const m of orgMems ?? []) memCount.set(m.user_id, (memCount.get(m.user_id) ?? 0) + 1);
  for (const m of agencyMems ?? []) memCount.set(m.user_id, (memCount.get(m.user_id) ?? 0) + 1);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-foreground text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1 text-sm">Every user account on the platform.</p>
      </header>

      {/* Search */}
      <form className="border-border bg-background flex flex-wrap items-end gap-3 rounded-xl border p-4 text-sm">
        <div className="flex-1">
          <label htmlFor="q" className="text-foreground mb-1 block text-xs font-medium">
            Search by email
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={params.q ?? ""}
            placeholder="user@example.com"
            className="border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Search
        </button>
      </form>

      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground border-border border-b text-xs uppercase">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Email</th>
                <th className="px-5 py-2.5 text-left font-medium">Name</th>
                <th className="px-5 py-2.5 text-right font-medium">Memberships</th>
                <th className="px-5 py-2.5 text-left font-medium">Last sign-in</th>
                <th className="px-5 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground p-8 text-center italic">
                    No users match.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const banned = (u as unknown as { banned_until?: string | null }).banned_until;
                  const isBanned =
                    typeof banned === "string" && new Date(banned).getTime() > Date.now();
                  return (
                    <tr key={u.id} className="hover:bg-surface">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/arbor/users/${u.id}`}
                          className="text-foreground hover:text-primary font-medium"
                        >
                          {u.email ?? <em>(no email)</em>}
                        </Link>
                        {!u.email_confirmed_at && (
                          <p className="text-muted-foreground mt-0.5 text-xs italic">
                            email unconfirmed
                          </p>
                        )}
                      </td>
                      <td className="text-foreground px-5 py-2.5 text-xs">
                        {(u.user_metadata.full_name as string | undefined) ?? "—"}
                      </td>
                      <td className="text-foreground px-5 py-2.5 text-right tabular-nums">
                        {(memCount.get(u.id) ?? 0).toString()}
                      </td>
                      <td className="text-foreground px-5 py-2.5 text-xs tabular-nums">
                        {u.last_sign_in_at
                          ? u.last_sign_in_at.slice(0, 16).replace("T", " ")
                          : "never"}
                      </td>
                      <td className="px-5 py-2.5 text-xs">
                        {isBanned ? (
                          <span className="text-destructive font-medium">Suspended</span>
                        ) : (
                          <span className="text-success">Active</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs">
        <p className="text-muted-foreground">
          Page {page.toString()} · showing {users.length.toString()} user
          {users.length === 1 ? "" : "s"}
          {q ? ` (${filtered.length.toString()} match search)` : ""}
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/arbor/users?${new URLSearchParams({ ...params, page: (page - 1).toString() }).toString()}`}
              className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 font-medium"
            >
              ← Previous
            </Link>
          )}
          {users.length === PAGE_SIZE && (
            <Link
              href={`/arbor/users?${new URLSearchParams({ ...params, page: (page + 1).toString() }).toString()}`}
              className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 font-medium"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
