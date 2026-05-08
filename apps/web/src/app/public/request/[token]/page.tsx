import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import PublicRequestForm from "./public-request-form";

type Params = Promise<{ token: string }>;

// /public/request/[token] — anonymous, no auth. Server validates the token
// against public_intake_links with the anon key and returns 404 if it's not
// active. The form posts back through the server action in actions.ts which
// also revalidates token-validity at submit time.

export default async function PublicRequestPage({ params }: { params: Params }) {
  const { token } = await params;

  const anonClient = createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: link } = await anonClient
    .from("public_intake_links")
    .select("token, label, org_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) notFound();

  // Resolve org name (also via anon — orgs are publicly readable per existing
  // RLS so the public form can show the host org).
  const { data: org } = await anonClient
    .from("organizations")
    .select("name")
    .eq("id", link.org_id)
    .maybeSingle();

  return (
    <main className="bg-surface min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="border-border bg-background rounded-xl border p-8 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Submit a training request
          </p>
          <h1 className="text-foreground mt-1 text-2xl font-semibold">
            {org?.name ?? "Training team"}
          </h1>
          {link.label && <p className="text-muted-foreground mt-1 text-sm">{link.label}</p>}
          <p className="text-muted-foreground mt-3 text-sm">
            Tell us what training you need. The training team will review your request and reach out
            via email.
          </p>

          <div className="mt-6">
            <PublicRequestForm token={token} />
          </div>
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">Powered by Arbor</p>
      </div>
    </main>
  );
}
