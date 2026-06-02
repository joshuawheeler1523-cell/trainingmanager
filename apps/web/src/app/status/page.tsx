import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { createClient } from "@/lib/supabase/server";
import { PROVIDER_IDENTITY } from "@/lib/legal/versions";
import LegalFooter from "@/components/legal/legal-footer";

export const metadata = { title: `Status — ${PROVIDER_IDENTITY.tradeName}` };

const SEVERITY_TONE: Record<string, { bg: string; fg: string; icon: typeof CheckCircleIcon }> = {
  minor: {
    bg: "bg-warning-bg",
    fg: "text-warning",
    icon: ExclamationTriangleIcon,
  },
  major: {
    bg: "bg-warning-bg",
    fg: "text-warning",
    icon: ExclamationTriangleIcon,
  },
  critical: {
    bg: "bg-danger-bg",
    fg: "text-danger",
    icon: ExclamationCircleIcon,
  },
  maintenance: {
    bg: "bg-info-bg",
    fg: "text-info",
    icon: WrenchScrewdriverIcon,
  },
};

export default async function StatusPage() {
  const supabase = await createClient();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: incidents } = await supabase
    .from("status_incidents")
    .select(
      "id, title, body, severity, status, started_at, resolved_at, status_incident_updates(id, status, body, created_at)",
    )
    .gte("started_at", ninetyDaysAgo)
    .order("started_at", { ascending: false });

  const all = incidents ?? [];
  const active = all.filter((i) => i.status !== "resolved");
  const resolved = all.filter((i) => i.status === "resolved");

  return (
    <div className="bg-canvas min-h-screen">
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-foreground font-serif text-xl tracking-tight">
            {PROVIDER_IDENTITY.tradeName}
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/trust" className="text-foreground hover:text-primary">
              Trust
            </Link>
            <Link href="/legal" className="text-foreground hover:text-primary">
              Legal
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-foreground font-serif text-3xl tracking-tight">Status</h1>

        {/* Headline */}
        {active.length === 0 ? (
          <div className="border-success-bd bg-success-bg mt-6 flex items-center gap-3 rounded-xl border p-5">
            <CheckCircleIcon className="text-success h-6 w-6" />
            <div>
              <p className="text-success text-base font-semibold">All systems operational</p>
              <p className="text-success text-xs">
                No active incidents. Last 90 days: {resolved.length.toString()} resolved incident
                {resolved.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {active.map((incident) => {
              const tone = SEVERITY_TONE[incident.severity] ?? SEVERITY_TONE["minor"];
              if (!tone) return null;
              const Icon = tone.icon;
              return (
                <div key={incident.id} className={`rounded-xl border p-5 ${tone.bg}`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.fg}`} />
                    <div className="flex-1">
                      <p className={`text-base font-semibold ${tone.fg}`}>{incident.title}</p>
                      <p className={`mt-1 text-xs ${tone.fg}`}>
                        {incident.severity} · {incident.status} · started{" "}
                        {incident.started_at.replace("T", " ").slice(0, 16)}
                      </p>
                      {incident.body && (
                        <p className="text-foreground mt-3 text-sm leading-relaxed">
                          {incident.body}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Updates timeline */}
                  {incident.status_incident_updates.length > 0 && (
                    <ul className="border-border mt-4 space-y-3 border-t pt-4">
                      {[...incident.status_incident_updates]
                        .sort((a, b) => b.created_at.localeCompare(a.created_at))
                        .map((u) => (
                          <li key={u.id}>
                            <p className="text-foreground text-xs font-medium uppercase tracking-wide">
                              {u.status} ·{" "}
                              <span className="text-muted-foreground">
                                {u.created_at.replace("T", " ").slice(0, 16)}
                              </span>
                            </p>
                            <p className="text-foreground mt-1 text-sm">{u.body}</p>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Subscribe */}
        <p className="text-muted-foreground mt-8 text-center text-xs">
          Subscribe to incident notifications: email{" "}
          <a href="mailto:status-subscribe@arbor.app" className="text-primary underline">
            status-subscribe@arbor.app
          </a>
          .
        </p>

        {/* History */}
        <section className="mt-12">
          <h2 className="text-foreground text-base font-bold">Past 90 days</h2>
          {resolved.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm italic">No resolved incidents.</p>
          ) : (
            <ul className="border-border divide-border bg-background mt-4 divide-y rounded-xl border">
              {resolved.map((i) => (
                <li key={i.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-foreground text-sm font-medium">{i.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {i.severity} · resolved{" "}
                      {(i.resolved_at ?? i.started_at).replace("T", " ").slice(0, 16)}
                    </p>
                  </div>
                  <CheckCircleIcon className="text-success h-5 w-5" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
