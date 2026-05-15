"use client";

import { useMemo } from "react";

type PrintRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  unit: string | null;
  class_id: string | null;
  class_name: string | null;
  topic: string | null;
  trained_at: string | null;
};

type Props = {
  orgName: string;
  rows: PrintRow[];
};

export default function PrintClient({ orgName, rows }: Props) {
  // Group by class (or "(Ad-hoc) topic" when no class linked, or "Untitled" as a
  // last resort) so each section prints together.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: PrintRow[] }>();
    for (const r of rows) {
      const key = r.class_id ?? `topic:${r.topic ?? ""}`;
      const label = r.class_name ?? (r.topic ? `Ad-hoc — ${r.topic}` : "Ad-hoc");
      const existing = map.get(key);
      if (existing) existing.rows.push(r);
      else map.set(key, { label, rows: [r] });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  return (
    <div className="bg-background min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 0.5in; }
        }
      `}</style>

      <div className="no-print bg-background border-border sticky top-0 z-10 border-b px-6 py-3">
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Print
        </button>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-8 text-sm">
        <header className="border-border mb-6 border-b pb-4">
          <h1 className="text-foreground text-xl font-semibold">{orgName} — Super users</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Generated{" "}
            {new Date().toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · {rows.length} super user{rows.length === 1 ? "" : "s"}
          </p>
        </header>

        {groups.length === 0 ? (
          <p className="text-muted-foreground">No super users tracked.</p>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="mb-6 break-inside-avoid">
              <h2 className="text-foreground border-border border-b pb-1 text-base font-semibold">
                {g.label}{" "}
                <span className="text-muted-foreground font-normal">({g.rows.length})</span>
              </h2>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1">Name</th>
                    <th className="py-1">Unit</th>
                    <th className="py-1">Email</th>
                    <th className="py-1">Phone</th>
                    <th className="py-1">Trained</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id} className="border-border border-t">
                      <td className="py-1 font-medium">{r.full_name}</td>
                      <td className="py-1">{r.unit ?? ""}</td>
                      <td className="py-1">{r.email ?? ""}</td>
                      <td className="py-1">{r.phone ?? ""}</td>
                      <td className="py-1">{r.trained_at ? `✓ ${r.trained_at}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
