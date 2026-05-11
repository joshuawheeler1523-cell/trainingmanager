import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import BaaRequestCard from "./baa-request-card";

export const metadata = { title: "BAA workflow" };

export default async function ArborBaaPage() {
  const admin = createAdminClient();
  const [{ data: baas }, { data: orgs }] = await Promise.all([
    admin.from("baa_requests").select("*").order("requested_at", { ascending: false }).limit(200),
    admin.from("organizations").select("id, name, slug"),
  ]);
  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  const buckets = {
    requested: (baas ?? []).filter((b) => b.status === "requested"),
    sent: (baas ?? []).filter((b) => b.status === "sent"),
    signed: (baas ?? []).filter((b) => b.status === "signed"),
    other: (baas ?? []).filter(
      (b) => b.status !== "requested" && b.status !== "sent" && b.status !== "signed",
    ),
  };

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-foreground text-2xl font-bold">BAA workflow</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Hospital customers request BAAs from <code>/admin/legal/baa</code>; manage them here.
          Upload countersigned PDFs and flip status as the deal progresses.
        </p>
      </header>

      <Section title={`Requested (${buckets.requested.length.toString()})`}>
        {buckets.requested.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">No new requests.</p>
        ) : (
          buckets.requested.map((b) => (
            <BaaRequestCard
              key={b.id}
              baa={b}
              org={orgById.get(b.org_id) ?? { id: b.org_id, name: "Unknown", slug: "—" }}
            />
          ))
        )}
      </Section>

      <Section title={`Sent for signature (${buckets.sent.length.toString()})`}>
        {buckets.sent.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">Nothing in flight.</p>
        ) : (
          buckets.sent.map((b) => (
            <BaaRequestCard
              key={b.id}
              baa={b}
              org={orgById.get(b.org_id) ?? { id: b.org_id, name: "Unknown", slug: "—" }}
            />
          ))
        )}
      </Section>

      <Section title={`Signed (${buckets.signed.length.toString()})`}>
        {buckets.signed.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">No signed BAAs yet.</p>
        ) : (
          <ul className="border-border bg-background divide-border divide-y rounded-xl border">
            {buckets.signed.map((b) => {
              const org = orgById.get(b.org_id);
              return (
                <li key={b.id} className="flex items-center justify-between p-4">
                  <div>
                    <Link
                      href={`/arbor/orgs/${b.org_id}`}
                      className="text-foreground hover:text-primary text-sm font-medium"
                    >
                      {org?.name ?? "Unknown org"}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      Signed by {b.signer_name ?? "—"}
                      {b.signer_title ? ` (${b.signer_title})` : ""} · effective{" "}
                      {b.effective_date ?? "—"}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    ✓ Active
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {buckets.other.length > 0 && (
        <Section title={`Other (${buckets.other.length.toString()})`}>
          <ul className="border-border bg-background divide-border divide-y rounded-xl border">
            {buckets.other.map((b) => {
              const org = orgById.get(b.org_id);
              return (
                <li key={b.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-foreground text-sm font-medium">{org?.name ?? "Unknown"}</p>
                    <p className="text-muted-foreground text-xs">
                      {b.status} · requested {b.requested_at.slice(0, 10)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-foreground mb-3 text-base font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
