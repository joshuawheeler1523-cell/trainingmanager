import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import AcceptForm, { SetPasswordForm } from "./accept-form";

type Params = Promise<{ token: string }>;

// /accept-invite/[token] — public route. Renders:
//   1. Token invalid / unknown → "not found" copy
//   2. Token expired or already accepted → status copy
//   3. Token valid + user NOT signed in → SetPasswordForm (primary flow)
//   4. Token valid + user signed in with matching email → Accept CTA
//   5. Token valid + user signed in with DIFFERENT email → warning

export default async function AcceptInvitePage({ params }: { params: Params }) {
  const { token } = await params;

  // Use the anon client to look up the invitation; the lookup RPC is granted
  // to anon explicitly so the page works pre-auth.
  const anon = createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: invites } = await anon.rpc("lookup_invitation_by_token", { p_token: token });
  const invite = invites?.[0] ?? null;

  // Check whether the visiting user is signed in (cookie-bound client).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!invite) {
    return (
      <Shell title="Invitation not found">
        <p className="text-muted-foreground text-sm">
          This invitation link is invalid or has been revoked. Ask the org admin to send a new one.
        </p>
      </Shell>
    );
  }

  const expired = new Date(invite.expires_at) < new Date();
  // Generated RPC types treat the return columns as non-nullable; in practice
  // accepted_at can be null. Coerce via the row's truthiness on the value
  // string rather than the type.
  const accepted = Boolean(invite.accepted_at);

  if (accepted) {
    if (user) redirect("/");
    return (
      <Shell title={`${invite.org_name} · invitation already accepted`}>
        <p className="text-muted-foreground text-sm">
          This invitation has already been accepted. Sign in to{" "}
          <span className="text-foreground font-medium">{invite.email}</span> to access the
          organization.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/accept-invite/${token}`)}`}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 inline-flex rounded-md px-3 py-1.5 text-sm font-medium"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell title={`${invite.org_name} · invitation expired`}>
        <p className="text-muted-foreground text-sm">
          This invitation expired on {new Date(invite.expires_at).toLocaleDateString()}. Ask the org
          admin to send a new one.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={`Join ${invite.org_name}`}>
      <p className="text-muted-foreground text-sm">
        You&apos;ve been invited to{" "}
        <span className="text-foreground font-medium">{invite.org_name}</span> as{" "}
        <span className="text-foreground capitalize">
          {invite.role.replace("org_admin", "admin")}
        </span>
        . The invitation was sent to{" "}
        <span className="text-foreground font-medium">{invite.email}</span>.
      </p>
      {user ? (
        user.email?.toLowerCase() === invite.email.toLowerCase() ? (
          <AcceptForm token={token} />
        ) : (
          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            You&apos;re signed in as <span className="font-medium">{user.email}</span>, but this
            invitation is for <span className="font-medium">{invite.email}</span>. Sign out and try
            the link again.
          </p>
        )
      ) : (
        <SetPasswordForm token={token} email={invite.email} />
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="bg-surface min-h-screen">
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="border-border bg-background rounded-xl border p-8 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Invitation</p>
          <h1 className="text-foreground mt-1 text-xl font-semibold">{title}</h1>
          <div className="mt-4">{children}</div>
        </div>
        <p className="text-muted-foreground mt-4 text-center text-xs">Powered by Arbor</p>
      </div>
    </main>
  );
}
