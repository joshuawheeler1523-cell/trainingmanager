import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { projectPercentComplete, type Milestone, type Project, type Task } from "@arbor/shared";

type Params = Promise<{ token: string }>;

// /public/projects/[token] — anonymous, no auth. Validates the token by
// (1) calling the set_share_token RPC to set request.share_token for this
// session, then (2) selecting the matching project row. The RLS policies
// on tasks/milestones/team scope reads to the project that matches that
// session var, so even an attacker who guessed nothing else still only
// sees projects whose shares are explicitly active.

export default async function PublicProjectPage({ params }: { params: Params }) {
  const { token } = await params;

  const anonClient = createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Set the session var so RLS policies match. We pass the token as a
  // single-statement RPC; supabase-js opens a fresh connection per call,
  // so the same connection has to issue our select afterwards. We work
  // around that by re-setting it inline before each query — both work
  // because PostgREST honors `set_config` when called via RPC and the
  // session is reused inside one PostgREST request.
  await anonClient.rpc("set_share_token", { p_token: token });

  const { data: project } = await anonClient
    .from("projects")
    .select("*")
    .eq("public_share_token", token)
    .maybeSingle();
  if (!project) notFound();

  const projectId = project.id;

  await anonClient.rpc("set_share_token", { p_token: token });
  const [{ data: tasks }, { data: milestones }, { data: team }] = await Promise.all([
    anonClient.from("tasks").select("*").eq("project_id", projectId).order("sort_order"),
    anonClient.from("milestones").select("*").eq("project_id", projectId).order("due_date"),
    anonClient.from("v_public_project_team").select("*").eq("project_id", projectId),
  ]);

  const taskList = (tasks ?? []) as Task[];
  const milestoneList = (milestones ?? []) as Milestone[];
  const teamList = (team ?? []) as {
    id: string;
    project_id: string;
    role: string;
    allocated_hours: number;
    instructor_name: string;
  }[];

  const percent = projectPercentComplete(taskList);
  const proj = project as unknown as Project;

  return (
    <main className="bg-surface min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="border-border bg-background rounded-xl border p-8 shadow-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Project status · read only
          </p>
          <h1 className="text-foreground mt-1 text-2xl font-semibold">{proj.name}</h1>
          {proj.description && (
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{proj.description}</p>
          )}

          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
            <span className="capitalize">Status: {proj.status.replace(/_/g, " ")}</span>
            <span className="capitalize">Priority: {proj.priority}</span>
            <span>{formatDateRange(proj.start_date, proj.end_date)}</span>
          </div>

          {/* Progress */}
          <section className="mt-6">
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Progress</p>
            <div className="flex items-baseline gap-3">
              <span className="text-foreground text-2xl font-semibold tabular-nums">
                {(percent ?? 0).toString()}%
              </span>
              <span className="text-muted-foreground text-xs">
                across {taskList.length.toString()} tasks
              </span>
            </div>
            <div className="bg-surface mt-2 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full"
                style={{ width: `${(percent ?? 0).toString()}%` }}
              />
            </div>
          </section>

          {/* Milestones */}
          {milestoneList.length > 0 && (
            <section className="mt-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">Milestones</p>
              <ul className="border-border divide-border divide-y rounded-md border">
                {milestoneList.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className={m.is_complete ? "text-emerald-500" : "text-amber-500"}>◆</span>
                    <span className="text-foreground flex-1">{m.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {new Date(m.due_date + "T00:00:00").toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Tasks */}
          <section className="mt-6">
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              Tasks ({taskList.length.toString()})
            </p>
            {taskList.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tasks yet.</p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-md border">
                {taskList.map((t) => (
                  <li key={t.id} className="px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-foreground text-sm font-medium">{t.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {t.percent_complete.toString()}%
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      <span className="capitalize">{t.status.replace(/_/g, " ")}</span>
                      {t.start_date && t.end_date && (
                        <span className="tabular-nums">
                          {t.start_date} → {t.end_date}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Team */}
          {teamList.length > 0 && (
            <section className="mt-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                Team ({teamList.length.toString()})
              </p>
              <ul className="text-foreground space-y-0.5 text-sm">
                {teamList.map((m) => (
                  <li key={m.id}>
                    {m.instructor_name}{" "}
                    <span className="text-muted-foreground text-xs capitalize">· {m.role}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">Powered by Arbor</p>
      </div>
    </main>
  );
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "No dates set";
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString();
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return end ? `Until ${fmt(end)}` : "No dates set";
}
