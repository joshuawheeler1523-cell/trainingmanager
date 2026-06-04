import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import InstructorFeedbackForm from "./instructor-feedback-form";

type Params = Promise<{ token: string }>;

type LinkContext = {
  label: string | null;
  org_name: string | null;
  instructors?: { id: string; name: string }[];
};

// /feedback/[token] — anonymous, no auth. Resolves the deliverable + its
// instructors via the token-gated feedback_link_context RPC and renders a
// quick L1 (reaction) pulse. The submit action re-validates the token.
export default async function FeedbackPage({ params }: { params: Params }) {
  const { token } = await params;

  const anon = createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: ctxRaw } = await anon.rpc("feedback_link_context", { p_token: token });
  const ctx = ctxRaw as LinkContext | null;
  if (!ctx) notFound();
  const instructors = ctx.instructors ?? [];

  return (
    <main className="bg-surface min-h-screen">
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="border-border bg-background rounded-xl border p-7 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            {ctx.org_name ?? "Training team"} · Session feedback
          </p>
          <h1 className="text-foreground mt-1 text-2xl font-semibold">
            How was {ctx.label ?? "your training"}?
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Takes about 30 seconds. Your responses are anonymous and help us improve.
          </p>

          {instructors.length === 0 ? (
            <p className="text-muted-foreground mt-6 text-sm">
              This session has no instructor on record yet — please check back later.
            </p>
          ) : (
            <div className="mt-6">
              <InstructorFeedbackForm token={token} instructors={instructors} />
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-6 text-center text-xs">Powered by Arbor</p>
      </div>
    </main>
  );
}
